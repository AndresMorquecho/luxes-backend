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
  console.log('Limpiando y sembrando roles...');
  // Limpiar relaciones previas para evitar conflictos de foreign key
  await prisma.user.updateMany({ data: { roleId: null, rol: 'visor' } });
  await prisma.rolePermission.deleteMany({});
  await prisma.role.deleteMany({});

  const adminRole = await prisma.role.create({
    data: { name: 'Administrador', description: 'Control Total del Sistema' },
  });

  const ventasDisenadorRole = await prisma.role.create({
    data: { name: 'Ventas / Diseñador', description: 'Gestión de ventas, diseño de proyectos, clientes y caja' },
  });

  const impresionRole = await prisma.role.create({
    data: { name: 'Impresión', description: 'Módulo de impresión, cola de impresión e inventario' },
  });

  const tallerRole = await prisma.role.create({
    data: { name: 'Taller', description: 'Gestión de taller, instalaciones y compras' },
  });

  // 3. Relacionar Roles con Permisos
  console.log('Vinculando permisos a roles...');

  // Administrador: Todos los permisos
  for (const perm of dbPermissions) {
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // Impresión: módulo de impresión, cola de impresión e inventario
  const impresionKeys = ['inventario', 'pedidos'];
  for (const perm of dbPermissions.filter(p => impresionKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: impresionRole.id, permissionId: perm.id },
    });
  }

  // Ventas / Diseñador: clientes, abonos, caja
  const ventasDisenadorKeys = ['clientes', 'abonos', 'control_caja'];
  for (const perm of dbPermissions.filter(p => ventasDisenadorKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: ventasDisenadorRole.id, permissionId: perm.id },
    });
  }

  // Taller: inventario y pedidos
  const tallerKeys = ['inventario', 'pedidos'];
  for (const perm of dbPermissions.filter(p => tallerKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: tallerRole.id, permissionId: perm.id },
    });
  }

  // 4. Sembrar Empleados y Usuarios
  console.log('Sembrando colaboradores (empleados)...');
  const empleadosData = [
    {
      id: 'EMP-001',
      nombre: 'Andrés Israel',
      cedula: '0999999991',
      cargo: 'Administrador Principal',
      departamento: 'Administración',
      correo: 'admin@luxes.com',
    },
    {
      id: 'EMP-002',
      nombre: 'María Fernanda Torres',
      cedula: '0999999992',
      cargo: 'Servicio al Cliente',
      departamento: 'Operaciones',
      correo: 'maria.torres@luxes.com',
    },
    {
      id: 'EMP-003',
      nombre: 'Impresor Principal',
      cedula: '0999999993',
      cargo: 'Impresor',
      departamento: 'Producción',
      correo: 'impresion@luxes.com',
    },
    {
      id: 'EMP-004',
      nombre: 'Andrés Israel',
      cedula: '0999999994',
      cargo: 'Vendedor Principal',
      departamento: 'Ventas',
      correo: 'ventas@luxes.com',
    },
    {
      id: 'EMP-005',
      nombre: 'Diseñador Creativo',
      cedula: '0999999995',
      cargo: 'Diseñador',
      departamento: 'Diseño',
      correo: 'disenador@luxes.com',
    },
    {
      id: 'EMP-006',
      nombre: 'Usuario Multirol',
      cedula: '0999999996',
      cargo: 'Administrador Auxiliar',
      departamento: 'Administración',
      correo: 'multirol@luxes.com',
    },
    {
      id: 'EMP-TALLER-001',
      nombre: 'Taller Técnico',
      cedula: '0999999997',
      cargo: 'Técnico de Taller',
      departamento: 'Taller',
      correo: 'taller@luxes.com',
    },
  ];

  for (const emp of empleadosData) {
    await prisma.empleado.upsert({
      where: { id: emp.id },
      update: {
        nombre: emp.nombre,
        cedula: emp.cedula,
        cargo: emp.cargo,
        departamento: emp.departamento,
        correo: emp.correo,
      },
      create: {
        ...emp,
        passwordHash: defaultPasswordHash,
      },
    });
  }

  console.log('Sembrando usuarios...');
  const usersData = [
    {
      id: 'USR-001',
      nombre: 'Andrés Israel',
      email: 'admin@luxes.com',
      username: 'admin',
      rol: 'Administrador',
      roleId: adminRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-01-15T00:00:00Z'),
      empleadoId: 'EMP-001',
    },
    {
      id: 'USR-002',
      nombre: 'María Fernanda Torres',
      email: 'maria.torres@luxes.com',
      username: 'maria.torres',
      rol: 'Ventas / Diseñador',
      roleId: ventasDisenadorRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-02-20T00:00:00Z'),
      empleadoId: 'EMP-002',
    },
    {
      id: 'USR-003',
      nombre: 'Impresor Principal',
      email: 'impresion@luxes.com',
      username: 'impresion',
      rol: 'Impresión',
      roleId: impresionRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-06-18T00:00:00Z'),
      empleadoId: 'EMP-003',
    },
    {
      id: 'USR-004',
      nombre: 'Andrés Israel',
      email: 'ventas@luxes.com',
      username: 'ventas',
      rol: 'Ventas / Diseñador',
      roleId: ventasDisenadorRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-06-18T00:00:00Z'),
      empleadoId: 'EMP-004',
    },
    {
      id: 'USR-005',
      nombre: 'Diseñador Creativo',
      email: 'disenador@luxes.com',
      username: 'disenador',
      rol: 'Ventas / Diseñador',
      roleId: ventasDisenadorRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-06-18T00:00:00Z'),
      empleadoId: 'EMP-005',
    },
    {
      id: 'USR-006',
      nombre: 'Usuario Multirol',
      email: 'multirol@luxes.com',
      username: 'multirol',
      rol: 'Administrador',
      roleId: adminRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-06-18T00:00:00Z'),
      empleadoId: 'EMP-006',
    },
    {
      id: 'USR-TALLER-001',
      nombre: 'Taller Técnico',
      email: 'taller@luxes.com',
      username: 'taller',
      rol: 'Taller',
      roleId: tallerRole.id,
      estado: 'activo',
      fechaCreacion: new Date('2025-06-18T00:00:00Z'),
      empleadoId: 'EMP-TALLER-001',
    },
  ];

  for (const user of usersData) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { 
        roleId: user.roleId, 
        rol: user.rol, 
        email: user.email, 
        nombre: user.nombre, 
        username: user.username,
        passwordHash: defaultPasswordHash,
        empleadoId: user.empleadoId
      },
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
      usuarioNom: 'Andrés Israel',
      accion: 'Crear material',
      modulo: 'Inventario',
      detalle: 'Agregó material: Vinilo autoadhesivo brillante (consumible).',
      severidad: 'Info',
    },
    {
      fecha: new Date('2026-06-02T14:30:00Z'),
      userId: 'USR-001',
      usuarioNom: 'Andrés Israel',
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
  const unidadesMap = [
    { nombre: 'metros', abreviacion: 'm' },
    { nombre: 'litros', abreviacion: 'L' },
    { nombre: 'rollos', abreviacion: 'rollos' },
    { nombre: 'hojas', abreviacion: 'hojas' },
    { nombre: 'planchas', abreviacion: 'planchas' },
    { nombre: 'unidades', abreviacion: 'unid' },
  ];
  for (const item of unidadesMap) {
    await prisma.unidadMedida.create({
      data: item
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
    // Lona traslúcida
    { nombre: 'Lona traslúcida - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 120, stockMinimo: 20, precioCosto: 4.5, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOTR-1.5', ancho: 1.5 },
    { nombre: 'Lona traslúcida - 2.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 80, stockMinimo: 15, precioCosto: 5.5, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOTR-2.2', ancho: 2.2 },

    // Lona brillo
    { nombre: 'Lona brillo - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 200, stockMinimo: 30, precioCosto: 3.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOBR-1.5', ancho: 1.5 },
    { nombre: 'Lona brillo - 2.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 150, stockMinimo: 20, precioCosto: 4.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOBR-2.2', ancho: 2.2 },
    { nombre: 'Lona brillo - 3.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 100, stockMinimo: 10, precioCosto: 5.8, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOBR-3.2', ancho: 3.2 },

    // Lona mate
    { nombre: 'Lona mate - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 140, stockMinimo: 20, precioCosto: 3.2, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOMT-1.5', ancho: 1.5 },
    { nombre: 'Lona mate - 2.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 90, stockMinimo: 15, precioCosto: 4.2, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'LOMT-2.2', ancho: 2.2 },

    // Vinil brillo
    { nombre: 'Vinil brillo - 1.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 180, stockMinimo: 30, precioCosto: 2.5, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VNBR-1.2', ancho: 1.2 },
    { nombre: 'Vinil brillo - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 130, stockMinimo: 20, precioCosto: 3.2, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VNBR-1.5', ancho: 1.5 },

    // Vinil mate
    { nombre: 'Vinil mate - 1.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 160, stockMinimo: 25, precioCosto: 2.7, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VNMT-1.2', ancho: 1.2 },
    { nombre: 'Vinil mate - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 110, stockMinimo: 15, precioCosto: 3.4, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VNMT-1.5', ancho: 1.5 },

    // Vinil laminación brillo
    { nombre: 'Vinil laminación brillo - 1.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 100, stockMinimo: 15, precioCosto: 1.8, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VMLB-1.2', ancho: 1.2 },
    { nombre: 'Vinil laminación brillo - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 90, stockMinimo: 15, precioCosto: 2.2, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VMLB-1.5', ancho: 1.5 },

    // Vinil laminación mate
    { nombre: 'Vinil laminación mate - 1.2m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 95, stockMinimo: 15, precioCosto: 1.9, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VMLM-1.2', ancho: 1.2 },
    { nombre: 'Vinil laminación mate - 1.5m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 85, stockMinimo: 15, precioCosto: 2.3, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'VMLM-1.5', ancho: 1.5 },

    // Tela sintética
    { nombre: 'Tela sintética - 1.6m', tipo: 'consumible', unidadMedida: 'metros', stockActual: 70, stockMinimo: 10, precioCosto: 6.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'TLSN-1.6', ancho: 1.6 },

    // PVC (by planchas / units)
    { nombre: 'PVC - 3mm', tipo: 'consumible', unidadMedida: 'planchas', stockActual: 40, stockMinimo: 5, precioCosto: 15.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'PVC-3MM', ancho: null },
    { nombre: 'PVC - 5mm', tipo: 'consumible', unidadMedida: 'planchas', stockActual: 25, stockMinimo: 5, precioCosto: 22.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'PVC-5MM', ancho: null },

    // Tintas
    { nombre: 'Tinta solvente Magenta', tipo: 'consumible', unidadMedida: 'litros', stockActual: 12, stockMinimo: 3, precioCosto: 28.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'INK-MAG', ancho: null },
    { nombre: 'Tinta solvente Cian', tipo: 'consumible', unidadMedida: 'litros', stockActual: 10, stockMinimo: 3, precioCosto: 28.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'INK-CYN', ancho: null },
    { nombre: 'Tinta solvente Amarilla', tipo: 'consumible', unidadMedida: 'litros', stockActual: 11, stockMinimo: 3, precioCosto: 28.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'INK-YEL', ancho: null },
    { nombre: 'Tinta solvente Negra', tipo: 'consumible', unidadMedida: 'litros', stockActual: 15, stockMinimo: 3, precioCosto: 25.0, categoria: 'Impresión', estadoUso: 'BODEGA', codigo: 'INK-BLK', ancho: null },

    // Taller/Otros
    { nombre: 'Cinta doble faz 2cm',             tipo: 'consumible',  unidadMedida: 'rollos',   stockActual: 40,  stockMinimo: 10,  precioCosto: 1.8, categoria: 'Taller', estadoUso: 'BODEGA'  },
    { nombre: 'Papel transfer para sublimación', tipo: 'consumible',  unidadMedida: 'hojas',    stockActual: 500, stockMinimo: 100, precioCosto: 0.15, categoria: 'Impresión', estadoUso: 'BODEGA' },
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

  const proveedores = [
    { nombre: 'Distribuidora de Vinilos S.A.', ruc: '0991728394001', direccion: 'Av. Juan Tanca Marengo', telefono: '0999999999', email: 'ventas@vinilos.com', contacto: 'Juan Pérez' },
    { nombre: 'Aceros del Pacífico', ruc: '1792837492001', direccion: 'Vía a Daule Km 12', telefono: '0988888888', email: 'info@acerospacifico.com', contacto: 'María Gómez' },
    { nombre: 'Suministros Gráficos Express', ruc: '0983748293001', direccion: 'Centro de Guayaquil', telefono: '0977777777', email: 'express@graficos.com', contacto: 'Carlos Ruiz' }
  ];
  
  const dbProveedores = [];
  for (const prov of proveedores) {
    const dbProv = await prisma.proveedor.upsert({
      where: { ruc: prov.ruc },
      update: {
        nombre: prov.nombre,
        direccion: prov.direccion,
        telefono: prov.telefono,
        email: prov.email,
        contacto: prov.contacto
      },
      create: prov
    });
    dbProveedores.push(dbProv);
  }

  const metodosPago = [
    { nombre: 'Caja Chica', descripcion: 'Efectivo para compras menores', tipo: 'EFECTIVO' },
    { nombre: 'Caja General', descripcion: 'Efectivo de la caja principal', tipo: 'EFECTIVO' },
    { nombre: 'Banco (Transferencia)', descripcion: 'Transferencia bancaria directa', tipo: 'BANCO' },
    { nombre: 'Banco (Cheque)', descripcion: 'Cheque emitido por la empresa', tipo: 'BANCO' }
  ];
  
  const dbMetodosPago = [];
  for (const mp of metodosPago) {
    const dbMp = await prisma.metodoPago.upsert({
      where: { nombre: mp.nombre },
      update: { descripcion: mp.descripcion, tipo: mp.tipo },
      create: mp,
    });
    dbMetodosPago.push(dbMp);
  }

  // Sanitizar proformas históricas para actualizar "Admin Principal" y "Vendedor Principal" a "Andrés Israel"
  console.log('Sanitizando proformas históricas...');
  await prisma.proforma.updateMany({
    where: { atiende: 'Admin Principal' },
    data: { atiende: 'Andrés Israel' }
  });
  await prisma.proforma.updateMany({
    where: { atiende: 'Vendedor Principal' },
    data: { atiende: 'Andrés Israel' }
  });

  // Sembrar datos de prueba para Egresos (Orden de Compra y AbonoCompra)
  console.log('Sembrando egresos de prueba...');
  const provVinilos = dbProveedores.find(p => p.ruc === '0991728394001');
  const metodoBanco = dbMetodosPago.find(m => m.nombre === 'Banco (Transferencia)');
  const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });

  if (provVinilos && metodoBanco && adminUser) {
    // 1. Upsert Orden Compra de prueba
    const ocId = 'OC-SEED-001';
    await prisma.ordenCompra.upsert({
      where: { numero: 'OC-2026-0001' },
      update: {
        proveedorId: provVinilos.id,
        usuarioId: adminUser.id,
        subtotal: 100,
        impuesto: 12,
        total: 112,
        estado: 'aprobada',
        estadoPago: 'pagado',
        concepto: 'Compra de vinilo e insumos gráficos de prueba',
      },
      create: {
        id: ocId,
        numero: 'OC-2026-0001',
        proveedorId: provVinilos.id,
        usuarioId: adminUser.id,
        fecha: new Date(),
        subtotal: 100,
        impuesto: 12,
        total: 112,
        estado: 'aprobada',
        estadoPago: 'pagado',
        concepto: 'Compra de vinilo e insumos gráficos de prueba',
        aprobadoPorId: adminUser.id,
        fechaAprobacion: new Date()
      }
    });

    // 2. Upsert Abono Compra de prueba
    const abonoId = 'ABONO-SEED-001';
    await prisma.abonoCompra.upsert({
      where: { id: abonoId },
      update: {
        ordenCompraId: ocId,
        metodoPagoId: metodoBanco.id,
        monto: 112,
        referencia: 'TRANSF-982173'
      },
      create: {
        id: abonoId,
        ordenCompraId: ocId,
        metodoPagoId: metodoBanco.id,
        monto: 112,
        fecha: new Date(),
        referencia: 'TRANSF-982173'
      }
    });
  }

  // Sembrar Gasto de prueba
  if (metodoBanco) {
    const gastoId = 'GASTO-SEED-001';
    await prisma.gasto.upsert({
      where: { id: gastoId },
      update: {
        concepto: 'Pago de internet y telefonía oficina de prueba',
        categoria: 'servicios',
        monto: 45.00,
        proveedor: 'Netlife S.A.',
        metodoPagoId: metodoBanco.id
      },
      create: {
        id: gastoId,
        concepto: 'Pago de internet y telefonía oficina de prueba',
        categoria: 'servicios',
        fecha: new Date(),
        monto: 45.00,
        proveedor: 'Netlife S.A.',
        metodoPagoId: metodoBanco.id
      }
    });
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
