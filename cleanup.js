import fs from 'fs';
import path from 'path';

const filesToDelete = [
  'src/diagnostico-prod.ts',
  'src/run_diag.js',
  'src/fix-prod-fechas-he.js',
  'src/audit-asistencias-he.js',
  'src/crear-solicitudes-he.js',
  'src/verificar-3-casos.js',
];

const basePath = process.cwd();

for (const file of filesToDelete) {
  const fullPath = path.join(basePath, file);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`Deleted: ${file}`);
  }
}
