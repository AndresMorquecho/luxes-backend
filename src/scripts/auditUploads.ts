import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/prismaClient.js';
import { safeUnlinkFile } from '../shared/utils/pathSafetyHelper.js';

async function getAllFilesOnDisk(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await getAllFilesOnDisk(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error(`[auditUploads] Error leyendo directorio ${dirPath}:`, err);
    }
  }
  return files;
}

async function collectDbUrls(): Promise<Set<string>> {
  const dbUrls = new Set<string>();

  const addUrl = (rawUrl?: string | null) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    let clean = rawUrl.trim();
    if (!clean.startsWith('/uploads/')) return;
    dbUrls.add(path.resolve(`.${clean}`));
  };

  // 1. Empleados & Documentos
  const docs = await prisma.empleadoDocumento.findMany({ select: { archivoUrl: true } });
  docs.forEach((d) => addUrl(d.archivoUrl));

  const emps = await prisma.empleado.findMany({ select: { foto: true } });
  emps.forEach((e) => addUrl(e.foto));

  // 2. Landing
  const landingImgs = await prisma.landingCategoryImage.findMany({ select: { imageUrl: true } });
  landingImgs.forEach((l) => addUrl(l.imageUrl));

  // 3. Proformas
  const abonosProforma = await prisma.abonoProforma.findMany({ select: { comprobanteUrl: true } });
  abonosProforma.forEach((a) => addUrl(a.comprobanteUrl));

  // 4. Proyectos Fases (JSON)
  const fases = await prisma.proyectoFase.findMany({ select: { datos: true } });
  for (const fase of fases) {
    if (!fase.datos) continue;
    try {
      const parsed = JSON.parse(fase.datos);
      const checkObj = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj.url === 'string') addUrl(obj.url);
        if (Array.isArray(obj.archivosArte)) obj.archivosArte.forEach(checkObj);
        if (Array.isArray(obj.evidencias)) obj.evidencias.forEach(checkObj);
      };
      checkObj(parsed);
    } catch {
      // Ignorar errores de parseo JSON
    }
  }

  // 5. Nómina Registros (JSON abonos)
  const nominas = await prisma.nominaRegistro.findMany({ select: { abonos: true } });
  for (const nom of nominas) {
    if (!nom.abonos) continue;
    try {
      const abonosArr = typeof nom.abonos === 'string' ? JSON.parse(nom.abonos) : nom.abonos;
      if (Array.isArray(abonosArr)) {
        abonosArr.forEach((ab: any) => {
          if (ab && typeof ab.comprobanteUrl === 'string') addUrl(ab.comprobanteUrl);
          if (ab && typeof ab.url === 'string') addUrl(ab.url);
        });
      }
    } catch {
      // Ignorar errores de parseo
    }
  }

  return dbUrls;
}

export async function runUploadsAudit(cleanOrphans = false) {
  const uploadsBase = path.resolve('uploads');
  console.log(`[auditUploads] Iniciando auditoría de almacenamiento en: ${uploadsBase}`);

  const diskFiles = await getAllFilesOnDisk(uploadsBase);
  const dbUrls = await collectDbUrls();

  const diskFileSet = new Set(diskFiles.map((f) => path.resolve(f)));

  const orphanedFiles: string[] = [];
  for (const diskFile of diskFiles) {
    const resolvedDisk = path.resolve(diskFile);
    if (!dbUrls.has(resolvedDisk)) {
      orphanedFiles.push(resolvedDisk);
    }
  }

  const ghostUrls: string[] = [];
  for (const dbUrl of dbUrls) {
    if (!diskFileSet.has(dbUrl)) {
      ghostUrls.push(dbUrl);
    }
  }

  console.log('\n======================================================');
  console.log('            RESULTADOS DE LA AUDITORÍA DE ARCHIVOS');
  console.log('======================================================');
  console.log(`Archivos físicos encontrados en disco:  ${diskFiles.length}`);
  console.log(`URLs de archivos referenciados en BD:  ${dbUrls.size}`);
  console.log(`Archivos Huérfanos en disco (Sin BD): ${orphanedFiles.length}`);
  console.log(`URLs Fantasma en BD (Sin archivo en disco): ${ghostUrls.length}`);
  console.log('======================================================\n');

  if (orphanedFiles.length > 0) {
    console.log('--- Muestra de Archivos Huérfanos ---');
    orphanedFiles.slice(0, 10).forEach((f) => console.log(`  [HUÉRFANO] ${path.relative(uploadsBase, f)}`));
    if (orphanedFiles.length > 10) console.log(`  ... y ${orphanedFiles.length - 10} más.`);
  }

  if (ghostUrls.length > 0) {
    console.log('\n--- Muestra de URLs Fantasma ---');
    ghostUrls.slice(0, 10).forEach((u) => console.log(`  [FANTASMA] ${path.relative(uploadsBase, u)}`));
    if (ghostUrls.length > 10) console.log(`  ... y ${ghostUrls.length - 10} más.`);
  }

  if (cleanOrphans && orphanedFiles.length > 0) {
    console.log('\n[auditUploads] Limpiando archivos huérfanos...');
    let deletedCount = 0;
    for (const orphan of orphanedFiles) {
      try {
        await safeUnlinkFile(uploadsBase, orphan);
        deletedCount++;
      } catch (e) {
        console.error(`Error borrando ${orphan}:`, e);
      }
    }
    console.log(`[auditUploads] Limpieza completada: ${deletedCount} archivos huérfanos eliminados.`);
  } else if (orphanedFiles.length > 0) {
    console.log('\nPara eliminar automáticamente los archivos huérfanos, ejecute con la bandera --clean.');
  }

  await prisma.$disconnect();
}

// Ejecutar si se llama directamente desde CLI
if (process.argv[1] && process.argv[1].endsWith('auditUploads.ts')) {
  const shouldClean = process.argv.includes('--clean');
  runUploadsAudit(shouldClean).catch((err) => {
    console.error('Error en auditoría:', err);
    process.exit(1);
  });
}
