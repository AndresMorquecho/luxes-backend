import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

async function main() {
  const defaultPasswordHash = await bcrypt.hash('luxes2026', 10);

  // 1. Sembrar Permisos
  const permissionsData = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'pedidos', name: 'Pedidos' },
    { key: 'recepcion_pedidos', name: 'Recepción de Pedidos' },
    { key: 'entregas_pedidos', name: 'Entregas de Pedidos' },
    { key: 'clientes', name: 'Empresarias (Clientes)' },
    { key: 'abonos', name: 'Abonos' },
    { key: 'transacciones_globales', name: 'Transacciones Globales' },
    { key: 'validacion_pagos', name: 'Validación de Pagos' },
    { key: 'gestion_financiera', name: 'Gestión Financiera (Bancos)' },
    { key: 'inventario', name: 'Inventario' },
    { key: 'marcas', name: 'Marcas' },
    { key: 'catalogos_logistica', name: 'Catálogos/Logística' },
    { key: 'control_caja', name: 'Control de Caja' },
    { key: 'analisis_cartera', name: 'Análisis de Cartera' },
    { key: 'registro_llamadas', name: 'Registro de Llamadas' },
    { key: 'fidelizacion_clientes', name: 'Fidelización de Clientes' },
    { key: 'usuarios_roles', name: 'Usuarios y Roles' },
    { key: 'cambios_devoluciones', name: 'Cambios y Devoluciones' },
    { key: 'configuracion_sistema', name: 'Configuración del Sistema' },
    { key: 'aprobacion_ordenes_compra', name: 'Aprobación de Órdenes de Compra' },
    { key: 'gestion_tareas', name: 'Gestión de Tareas' },
  ];

  console.log('Sembrando permisos...');
  const dbPermissions = [];
  for (const perm of permissionsData) {
    const dbPerm = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { name: perm.name },
      create: { key: perm.key, name: perm.name },
    });
    dbPermissions.push(dbPerm);
  }

  // 2. Sembrar Roles
  console.log('Sembrando roles...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'Administrador' },
    update: { description: 'Control Total del Sistema' },
    create: { name: 'Administrador', description: 'Control Total del Sistema' },
  });

  const clientServiceRole = await prisma.role.upsert({
    where: { name: 'Servicio al Cliente' },
    update: { description: 'Gestión operativa de cobros y pedidos' },
    create: { name: 'Servicio al Cliente', description: 'Gestión operativa de cobros y pedidos' },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'User' },
    update: { description: 'Acceso básico de consulta' },
    create: { name: 'User', description: 'Acceso básico de consulta' },
  });

  // 3. Relacionar Roles con Permisos
  console.log('Vinculando permisos a roles...');
  await prisma.rolePermission.deleteMany({});

  // Administrador: Todos los permisos
  for (const perm of dbPermissions) {
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // Servicio al Cliente
  const scKeys = [
    'pedidos', 'recepcion_pedidos', 'entregas_pedidos', 'clientes', 'abonos',
    'inventario', 'marcas', 'catalogos_logistica', 'control_caja',
    'analisis_cartera', 'registro_llamadas', 'fidelizacion_clientes', 'cambios_devoluciones',
    'configuracion_sistema',
  ];
  for (const perm of dbPermissions.filter(p => scKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: clientServiceRole.id, permissionId: perm.id },
    });
  }

  // User: solo módulos básicos
  const userKeys = ['dashboard', 'pedidos', 'recepcion_pedidos', 'entregas_pedidos', 'clientes', 'control_caja'];
  for (const perm of dbPermissions.filter(p => userKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: userRole.id, permissionId: perm.id },
    });
  }

  // 4. Sembrar Usuarios
  console.log('Sembrando usuarios...');
  const usersData = [
    {
      id: 'USR-001',
      nombre: 'Admin Principal',
      email: 'admin@luxes.com',
      username: 'admin',
      rol: 'admin',
      roleId: adminRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-01-15T00:00:00Z'),
    },
    {
      id: 'USR-002',
      nombre: 'María Fernanda Torres',
      email: 'maria.torres@luxes.com',
      username: 'maria.torres',
      rol: 'editor',
      roleId: clientServiceRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-02-20T00:00:00Z'),
    },
  ];

  for (const user of usersData) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { roleId: user.roleId, rol: user.rol },
      create: { ...user, passwordHash: defaultPasswordHash },
    });
  }

  // 5. Sembrar Historial de Auditoría
  console.log('Sembrando bitácora de auditoría...');
  await prisma.auditLog.deleteMany({});

  const logsData = [
    {
      fecha: new Date('2026-06-04T17:05:00Z'),
      userId: 'USR-002',
      usuarioNom: 'María Fernanda Torres',
      accion: 'Registrar préstamo',
      modulo: 'Inventario',
      detalle: 'Registró salida de Escalera de aluminio 6m para instalación Mall del Sol.',
      severidad: 'Info',
    },
    {
      fecha: new Date('2026-06-03T09:20:00Z'),
      userId: 'USR-001',
      usuarioNom: 'Admin Principal',
      accion: 'Crear material',
      modulo: 'Inventario',
      detalle: 'Agregó material: Vinilo autoadhesivo brillante (consumible).',
      severidad: 'Info',
    },
    {
      fecha: new Date('2026-06-02T14:30:00Z'),
      userId: 'USR-001',
      usuarioNom: 'Admin Principal',
      accion: 'Desactivar usuario',
      modulo: 'Usuarios y Roles',
      detalle: 'Desactivó usuario: lucia.fernandez.',
      severidad: 'Advertencia',
    },
  ];

  for (const log of logsData) {
    await prisma.auditLog.create({ data: log });
  }

  // 6. Sembrar Materiales (Consumibles y Herramientas)
  console.log('Sembrando materiales de inventario...');
  await prisma.prestamo.deleteMany({});
  await prisma.movimientoInventario.deleteMany({});
  await prisma.material.deleteMany({});
  await prisma.unidadMedida.deleteMany({});

  console.log('Sembrando unidades de medida...');
  const unidades = ['metros', 'litros', 'rollos', 'hojas', 'planchas', 'unidades'];
  for (const nombre of unidades) {
    await prisma.unidadMedida.create({
      data: { nombre, abreviacion: nombre.slice(0, 3) }
    });
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const excelDataPath = path.join(__dirname, 'parsed_excel.json');

  let excelData: any = null;
  try {
    excelData = JSON.parse(fs.readFileSync(excelDataPath, 'utf8'));
  } catch (err: any) {
    console.error('No se pudo cargar parsed_excel.json:', err.message);
  }

  // Insertar Consumibles iniciales
  const materialesData = [
    { nombre: 'Vinilo autoadhesivo brillante',   tipo: 'consumible',  unidadMedida: 'metros',   stockActual: 150, stockMinimo: 20,  precioCosto: 3.5, categoria: 'Taller', estadoUso: 'BODEGA'  },
    { nombre: 'Vinilo esmerilado para vidrio',   tipo: 'consumible',  unidadMedida: 'metros',   stockActual: 80,  stockMinimo: 15,  precioCosto: 4.2, categoria: 'Taller', estadoUso: 'BODEGA'  },
    { nombre: 'Lona banner 440g',                tipo: 'consumible',  unidadMedida: 'metros',   stockActual: 200, stockMinimo: 30,  precioCosto: 2.8, categoria: 'Taller', estadoUso: 'BODEGA'  },
    { nombre: 'Tinta solvente Magenta',          tipo: 'consumible',  unidadMedida: 'litros',   stockActual: 12,  stockMinimo: 3,   precioCosto: 28.0, categoria: 'Taller', estadoUso: 'BODEGA' },
    { nombre: 'Tinta solvente Cian',             tipo: 'consumible',  unidadMedida: 'litros',   stockActual: 10,  stockMinimo: 3,   precioCosto: 28.0, categoria: 'Taller', estadoUso: 'BODEGA' },
    { nombre: 'Tinta solvente Negra',            tipo: 'consumible',  unidadMedida: 'litros',   stockActual: 15,  stockMinimo: 3,   precioCosto: 25.0, categoria: 'Taller', estadoUso: 'BODEGA' },
    { nombre: 'Cinta doble faz 2cm',             tipo: 'consumible',  unidadMedida: 'rollos',   stockActual: 40,  stockMinimo: 10,  precioCosto: 1.8, categoria: 'Taller', estadoUso: 'BODEGA'  },
    { nombre: 'Papel transfer para sublimación', tipo: 'consumible',  unidadMedida: 'hojas',    stockActual: 500, stockMinimo: 100, precioCosto: 0.15, categoria: 'Taller', estadoUso: 'BODEGA' },
    { nombre: 'Acrílico transparente 3mm',       tipo: 'consumible',  unidadMedida: 'planchas', stockActual: 25,  stockMinimo: 5,   precioCosto: 18.0, categoria: 'Taller', estadoUso: 'BODEGA' },
  ];

  for (const mat of materialesData) {
    const { unidadMedida, ...rest } = mat;
    await prisma.material.create({
      data: {
        ...rest,
        unidadMedida: { connect: { nombre: unidadMedida } }
      }
    });
  }

  if (excelData) {
    // 1. INVENTARIO DE TALLER
    const tallerRows = excelData['INVENTARIO DE TALLER '] || [];
    console.log(`Procesando ${tallerRows.length - 2} registros de taller...`);
    for (let i = 2; i < tallerRows.length; i++) {
      const row = tallerRows[i];
      if (!row || !row[1]) continue;

      const cant = typeof row[0] === 'number' ? row[0] : (parseFloat(row[0]) || 1);
      const nombre = String(row[1]).trim();
      const desc = row[2] ? String(row[2]).trim() : null;
      const marca = row[3] ? String(row[3]).trim() : null;
      const codigo = row[4] ? String(row[4]).trim() : null;
      const estadoExcel = row[5] ? String(row[5]).trim().toUpperCase() : 'BODEGA';
      const valor = typeof row[6] === 'number' ? row[6] : (parseFloat(row[6]) || 0);
      const aCargo = row[7] ? String(row[7]).trim() : null;

      let estadoUso = 'BODEGA';
      if (estadoExcel.includes('EN USO') || (aCargo && aCargo.toUpperCase() !== 'BODEGA' && aCargo.toUpperCase() !== 'LUXES')) {
        estadoUso = 'EN USO';
      } else if (estadoExcel.includes('NO SIRVE')) {
        estadoUso = 'NO SIRVE';
      } else if (estadoExcel.includes('REPARACION') || estadoExcel.includes('REPARACIÓN')) {
        estadoUso = 'EN REPARACION';
      }

      await prisma.material.create({
        data: {
          nombre,
          tipo: 'herramienta',
          unidadMedida: { connect: { nombre: 'unidades' } },
          stockActual: cant,
          stockMinimo: 0,
          precioCosto: valor,
          codigo,
          marca,
          serie: desc,
          categoria: 'Taller',
          estadoUso,
          aCargo: estadoUso === 'EN USO' ? aCargo : null,
        }
      });
    }

    // 2. INVENTARIO DE OFICINA
    const oficinaRows = excelData['INVENTARIO DE OFICINA '] || [];
    console.log(`Procesando ${oficinaRows.length - 2} registros de oficina...`);
    for (let i = 2; i < oficinaRows.length; i++) {
      const row = oficinaRows[i];
      if (!row || !row[1]) continue;

      const cant = typeof row[0] === 'number' ? row[0] : (parseFloat(row[0]) || 1);
      const nombre = String(row[1]).trim();
      const serie = row[2] ? String(row[2]).trim() : null;
      const marca = row[3] ? String(row[3]).trim() : null;
      const modelo = row[4] ? String(row[4]).trim() : null;
      const codigo = row[5] ? String(row[5]).trim() : null;
      const valor = typeof row[6] === 'number' ? row[6] : (parseFloat(row[6]) || 0);

      await prisma.material.create({
        data: {
          nombre,
          tipo: 'herramienta',
          unidadMedida: { connect: { nombre: 'unidades' } },
          stockActual: cant,
          stockMinimo: 0,
          precioCosto: valor,
          codigo,
          marca,
          modelo,
          serie,
          categoria: 'Oficina',
          estadoUso: 'BODEGA',
          aCargo: null,
        }
      });
    }
  }

  // 7. Sembrar Préstamos Históricos de Herramientas
  console.log('Sembrando préstamos de herramientas...');
  const userAdmin = await prisma.user.findFirst({ where: { username: 'admin' } });
  const userMaria = await prisma.user.findFirst({ where: { username: 'maria.torres' } });
  const userISAM  = await prisma.user.findFirst({ where: { username: 'ISAM' } });

  const responsable1 = userISAM ?? userAdmin;
  const responsable2 = userMaria ?? userAdmin;

  const taladro = await prisma.material.findFirst({
    where: { nombre: { contains: 'TALADRO', mode: 'insensitive' } }
  });
  const escalera = await prisma.material.findFirst({
    where: { nombre: { contains: 'ESCALERA', mode: 'insensitive' } }
  });
  const pistola = await prisma.material.findFirst({
    where: { nombre: { contains: 'PISTOLA', mode: 'insensitive' } }
  });

  if (responsable1 && taladro) {
    await prisma.prestamo.create({
      data: {
        materialId: taladro.id,
        responsableId: responsable1.id,
        cantidad: 1,
        fechaSalida: new Date('2026-06-10T08:30:00Z'),
        fechaRetorno: new Date('2026-06-10T17:00:00Z'),
        comentarios: 'Instalación banner fachada cliente Banco del Pacífico.',
        estado: 'devuelto',
      },
    });
  }

  if (responsable2 && escalera) {
    await prisma.prestamo.create({
      data: {
        materialId: escalera.id,
        responsableId: responsable2.id,
        cantidad: 1,
        fechaSalida: new Date('2026-06-11T07:00:00Z'),
        comentarios: 'Instalación letras corporativas en Mall del Sol.',
        estado: 'prestado',
      },
    });
    await prisma.material.update({
      where: { id: escalera.id },
      data: { estadoUso: 'EN USO', aCargo: responsable2.nombre },
    });
  }

  if (responsable1 && pistola) {
    await prisma.prestamo.create({
      data: {
        materialId: pistola.id,
        responsableId: responsable1.id,
        cantidad: 1,
        fechaSalida: new Date('2026-06-11T09:15:00Z'),
        comentarios: 'Aplicación de vinilo vehicular flota camiones.',
        estado: 'prestado',
      },
    });
    await prisma.material.update({
      where: { id: pistola.id },
      data: { estadoUso: 'EN USO', aCargo: responsable1.nombre },
    });
  }

  console.log('Sembrando proveedores y métodos de pago...');
  await prisma.abonoCompra.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.detalleCompra.deleteMany({});
  await prisma.ordenCompra.deleteMany({});
  await prisma.proveedor.deleteMany({});
  await prisma.metodoPago.deleteMany({});

  const proveedores = [
    { nombre: 'Distribuidora de Vinilos S.A.', ruc: '0991728394001', direccion: 'Av. Juan Tanca Marengo', telefono: '0999999999', email: 'ventas@vinilos.com', contacto: 'Juan Pérez' },
    { nombre: 'Aceros del Pacífico', ruc: '1792837492001', direccion: 'Vía a Daule Km 12', telefono: '0988888888', email: 'info@acerospacifico.com', contacto: 'María Gómez' },
    { nombre: 'Suministros Gráficos Express', ruc: '0983748293001', direccion: 'Centro de Guayaquil', telefono: '0977777777', email: 'express@graficos.com', contacto: 'Carlos Ruiz' }
  ];
  for (const prov of proveedores) {
    await prisma.proveedor.create({ data: prov });
  }

  const metodosPago = [
    { nombre: 'Caja Chica', descripcion: 'Efectivo para compras menores' },
    { nombre: 'Caja General', descripcion: 'Efectivo de la caja principal' },
    { nombre: 'Banco (Transferencia)', descripcion: 'Transferencia bancaria directa' },
    { nombre: 'Banco (Cheque)', descripcion: 'Cheque emitido por la empresa' }
  ];
  for (const mp of metodosPago) {
    await prisma.metodoPago.create({ data: mp });
  }

  console.log('Sembrado finalizado exitosamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
