import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function generateUsername(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  const firstWord = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const nextInitial = parts[1] ? parts[1].charAt(0).toUpperCase() : '';
  return `${firstWord}${nextInitial}`;
}

async function main() {
  console.log('=== Iniciando limpieza total de la base de datos ===');

  const tablenames = [
    'audit_logs', 'movimientos_inventario', 'prestamos', 'abonos_compra', 'cuentas_por_pagar',
    'detalles_compra', 'ordenes_compra', 'proveedores', 'notifications', 'push_subscriptions',
    'tareas_asignaciones', 'tareas', 'abonos_proforma', 'proforma_items', 'proformas',
    'clientes', 'gastos', 'egresos', 'ingresos_detalles', 'asistencias', 'vacaciones',
    'horas_extras', 'nomina_registros', 'proyecto_instalacion_personal', 'proyecto_instalacion_materiales',
    'proyecto_instalaciones', 'proyecto_fases', 'proyectos', 'empleado_documentos', 'users',
    'empleados', 'role_permissions', 'roles', 'permissions', 'materiales', 'unidades_medida',
    'metodos_pago', 'nomina_config_global'
  ];

  for (const table of tablenames) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    } catch (e) {
      console.log(`Tabla "${table}" no pudo ser truncada (tal vez no exista aún):`, (e as Error).message);
    }
  }

  console.log('✓ Base de datos vaciada con éxito.');

  // 1. Sembrar Permisos
  console.log('Sembrando permisos por defecto...');
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

  const dbPermissions = [];
  for (const perm of permissionsData) {
    const dbPerm = await prisma.permission.create({
      data: { key: perm.key, name: perm.name },
    });
    dbPermissions.push(dbPerm);
  }

  // 2. Sembrar Roles
  console.log('Sembrando roles requeridos...');
  const adminRole = await prisma.role.create({
    data: { name: 'Administrador', description: 'Control Total del Sistema' },
  });

  const tallerRole = await prisma.role.create({
    data: { name: 'Taller', description: 'Módulo de taller, instalaciones y pedidos' },
  });

  const ventasRole = await prisma.role.create({
    data: { name: 'Ventas', description: 'Módulo de ventas, caja, clientes y abonos' },
  });

  const impresionRole = await prisma.role.create({
    data: { name: 'Impresión', description: 'Módulo de impresión y cola de impresión' },
  });

  const disenadorRole = await prisma.role.create({
    data: { name: 'Diseñador', description: 'Módulo de diseño y proyectos' },
  });

  // 3. Vincular permisos a roles
  console.log('Asignando permisos a roles...');
  // Administrador tiene todos
  for (const perm of dbPermissions) {
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // Permisos básicos para Taller
  const tallerKeys = ['inventario', 'pedidos'];
  for (const perm of dbPermissions.filter(p => tallerKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: tallerRole.id, permissionId: perm.id },
    });
  }

  // Permisos básicos para Ventas
  const ventasKeys = ['clientes', 'abonos', 'control_caja'];
  for (const perm of dbPermissions.filter(p => ventasKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: ventasRole.id, permissionId: perm.id },
    });
  }

  // Permisos básicos para Impresión
  const impresionKeys = ['inventario', 'pedidos'];
  for (const perm of dbPermissions.filter(p => impresionKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: impresionRole.id, permissionId: perm.id },
    });
  }

  // Permisos básicos para Diseñador
  const disenadorKeys = ['pedidos'];
  for (const perm of dbPermissions.filter(p => disenadorKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: disenadorRole.id, permissionId: perm.id },
    });
  }

  // 4. Sembrar configuración global de nómina
  await prisma.$executeRawUnsafe(`
    INSERT INTO "nomina_config_global" ("id", "sbu_vigente", "updated_at")
    VALUES ('default', 470.00, now())
    ON CONFLICT ("id") DO NOTHING;
  `);

  // 5. Sembrar Empleados y Usuarios especificados
  console.log('Sembrando empleados y usuarios...');
  const passwordHash = await bcrypt.hash('123456', 10);

  const rawPeople = [
    { name: 'MORQUECHO IVETTE', roleName: 'Administrador', roleId: adminRole.id },
    { name: 'CRISTOFER SUAREZ', roleName: 'Taller', roleId: tallerRole.id },
    { name: 'CHRISTHIAN PAREDES', roleName: 'Taller', roleId: tallerRole.id },
    { name: 'PAOLA CARRANZA', roleName: 'Ventas', roleId: ventasRole.id },
    { name: 'EDINSON MONCADA', roleName: 'Impresión', roleId: impresionRole.id },
    { name: 'JOSE ANDRES TAMAYO', roleName: 'Diseñador', roleId: disenadorRole.id },
    { name: 'JULEYSI OLVERA', roleName: 'Diseñador', roleId: disenadorRole.id },
    { name: 'NARCISA REINA', roleName: 'Ventas', roleId: ventasRole.id },
    { name: 'MAYBE ORELLANA', roleName: 'Ventas', roleId: ventasRole.id },
    { name: 'JIMMY EVANGELISTA', roleName: 'Administrador', roleId: adminRole.id }
  ];

  for (let i = 0; i < rawPeople.length; i++) {
    const person = rawPeople[i];
    const username = generateUsername(person.name);
    const idNum = (i + 1).toString().padStart(3, '0');
    const empId = `EMP-${idNum}`;
    const usrId = `USR-${idNum}`;
    const mockCedula = `0900000${idNum}`;

    console.log(`- Creando Empleado: ${person.name} | Usuario: ${username} (Rol: ${person.roleName})`);

    // Crear Empleado
    await prisma.empleado.create({
      data: {
        id: empId,
        nombre: person.name,
        cedula: mockCedula,
        correo: `${username.toLowerCase()}@luxes.com`,
        telefono: '0987654321',
        tipoContrato: 'Fijo',
        tieneContrato: true,
        region: 'costa',
        passwordHash: passwordHash
      }
    });

    // Crear Usuario vinculado
    await prisma.user.create({
      data: {
        id: usrId,
        nombre: person.name,
        email: `${username.toLowerCase()}@luxes.com`,
        username: username,
        rol: person.roleName,
        roleId: person.roleId,
        estado: 'activo',
        passwordHash: passwordHash,
        empleadoId: empId
      }
    });
  }

  console.log('=== Sembrado finalizado con éxito ===');
}

main()
  .catch((e) => {
    console.error('Error sembrando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
