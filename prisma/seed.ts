import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Iniciando limpieza total de la base de datos para ALUX ===');

  const tablenames = [
    'audit_logs', 'movimientos_inventario', 'prestamos', 'abonos_compra', 'cuentas_por_pagar',
    'detalles_compra', 'ordenes_compra', 'proveedores', 'notifications', 'push_subscriptions',
    'tareas_asignaciones', 'tareas', 'abonos_proforma', 'proforma_items', 'proformas',
    'clientes', 'gastos', 'egresos', 'ingresos_detalles', 'asistencias', 'vacaciones',
    'horas_extras', 'nomina_registros', 'proyecto_instalacion_personal', 'proyecto_instalacion_materiales',
    'proyecto_instalaciones', 'proyecto_fases', 'proyectos', 'empleado_documentos', 'users',
    'empleados', 'role_permissions', 'roles', 'permissions', 'materiales', 'unidades_medida',
    'metodos_pago', 'nomina_config_global', 'configuracion', 'gasto_fijo_pagos', 'gastos_fijos',
    'transferencias_cuentas', 'ingresos_caja', 'cierres_caja', 'reclamos_proyectos', 'impresion_jobs'
  ];

  for (const table of tablenames) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    } catch (e) {
      console.log(`Tabla "${table}" no pudo ser truncada (posiblemente omitida):`, (e as Error).message);
    }
  }

  console.log('✓ Base de datos vaciada con éxito.');

  // 1. Sembrar Permisos
  console.log('Sembrando permisos por defecto...');
  const permissionsData = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'pedidos', name: 'Proyectos y Fases' },
    { key: 'clientes', name: 'Clientes' },
    { key: 'proformas', name: 'Proformas y Cotizaciones' },
    { key: 'abonos', name: 'Abonos y Cobros' },
    { key: 'gestion_financiera', name: 'Gestión Financiera (Bancos y Movimientos)' },
    { key: 'inventario', name: 'Inventario de Materiales' },
    { key: 'control_caja', name: 'Control y Cierre de Caja' },
    { key: 'usuarios_roles', name: 'Usuarios y Roles' },
    { key: 'configuracion_sistema', name: 'Configuración del Sistema' },
    { key: 'aprobacion_ordenes_compra', name: 'Aprobación de Órdenes de Compra' },
    { key: 'gestion_tareas', name: 'Gestión de Tareas' },
    { key: 'nomina', name: 'Nómina y Asistencias' },
  ];

  const dbPermissions = [];
  for (const perm of permissionsData) {
    const dbPerm = await prisma.permission.create({
      data: { key: perm.key, name: perm.name },
    });
    dbPermissions.push(dbPerm);
  }

  // 2. Sembrar Roles Únicos de ALUX
  console.log('Sembrando roles de ALUX...');
  const adminRole = await prisma.role.create({
    data: { name: 'Administrador', description: 'Control Total del Sistema ALUX' },
  });

  const trabajadorRole = await prisma.role.create({
    data: { name: 'Trabajador', description: 'Acceso operativo: proyectos, fases, tareas y asistencia' },
  });

  // 3. Vincular permisos a roles
  console.log('Asignando permisos a roles...');
  for (const perm of dbPermissions) {
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  const trabajadorKeys = ['pedidos', 'gestion_tareas'];
  for (const perm of dbPermissions.filter(p => trabajadorKeys.includes(p.key))) {
    await prisma.rolePermission.create({
      data: { roleId: trabajadorRole.id, permissionId: perm.id },
    });
  }

  // 4. Sembrar configuración global de nómina y empresa
  await prisma.nominaConfigGlobal.upsert({
    where: { id: 'default' },
    update: { sbuVigente: 470.00 },
    create: { id: 'default', sbuVigente: 470.00 },
  });

  await prisma.configuracion.upsert({
    where: { id: 'default' },
    update: {
      condicionesPago: 'Forma de pago: 50% anticipo al confirmar la proforma y 50% contra entrega e instalación.\nTiempo de entrega estimado: 7 a 15 días laborables tras confirmación de medidas.\nPrecios incluyen instalación estándar en el área metropolitana.',
      celular: '+593 99 999 9999',
      email: 'contacto@alux.com',
      direccion: 'Guayaquil - Ecuador',
      diasValidez: 3,
    },
    create: {
      id: 'default',
      condicionesPago: 'Forma de pago: 50% anticipo al confirmar la proforma y 50% contra entrega e instalación.\nTiempo de entrega estimado: 7 a 15 días laborables tras confirmación de medidas.\nPrecios incluyen instalación estándar en el área metropolitana.',
      celular: '+593 99 999 9999',
      email: 'contacto@alux.com',
      direccion: 'Guayaquil - Ecuador',
      diasValidez: 3,
    },
  });

  // 5. Sembrar Métodos de Pago
  console.log('Sembrando métodos de pago...');
  const metodosPago = [
    { id: 'MP-001', nombre: 'Efectivo Caja Chica', descripcion: 'Efectivo en caja física', activo: true, tipo: 'EFECTIVO' },
    { id: 'MP-002', nombre: 'Banco Pichincha', descripcion: 'Cuenta bancaria corriente Banco Pichincha', activo: true, tipo: 'BANCO' },
    { id: 'MP-003', nombre: 'Banco Guayaquil', descripcion: 'Cuenta bancaria de ahorros Banco Guayaquil', activo: true, tipo: 'BANCO' },
    { id: 'MP-004', nombre: 'Transferencia Directa', descripcion: 'Transferencias interbancarias / ACH', activo: true, tipo: 'BANCO' }
  ];
  for (const mp of metodosPago) {
    await prisma.metodoPago.create({ data: mp });
  }

  // 6. Sembrar Unidades de Medida
  console.log('Sembrando unidades de medida...');
  const unidades = [
    { id: 'UM-001', nombre: 'Unidad', abreviacion: 'und' },
    { id: 'UM-002', nombre: 'Metro Lineal', abreviacion: 'm' },
    { id: 'UM-003', nombre: 'Metro Cuadrado', abreviacion: 'm²' },
    { id: 'UM-004', nombre: 'Plancha / Panel', abreviacion: 'pza' },
    { id: 'UM-005', nombre: 'Litro / Galón', abreviacion: 'L' }
  ];
  for (const u of unidades) {
    await prisma.unidadMedida.create({ data: u });
  }

  // 7. Sembrar Empleados y Usuarios de ALUX
  console.log('Sembrando empleados y usuarios oficiales de ALUX...');
  const passwordHash = await bcrypt.hash('123456', 10);

  /**
   * Nómina Oficial ALUX:
   * - Mujeres: Rol Administrador
   * - Hombres: Rol Trabajador
   */
  const aluxEmployees = [
    // Mujeres -> Administrador
    {
      name: 'ANGELICA JULIANA GOMEZ QUEVEDO',
      username: 'angelicagomez',
      cedula: '0926308867',
      correo: 'angelicagomez@alux.com',
      telefono: '0926308867',
      roleName: 'Administrador',
      roleId: adminRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },
    {
      name: 'CARRASCO MORILLO LISSETTE JACQUELINE',
      username: 'lissettecarrasco',
      cedula: '0941349219',
      correo: 'lissettecarrasco@alux.com',
      telefono: '0941349219',
      roleName: 'Administrador',
      roleId: adminRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },

    // Hombres -> Trabajador
    {
      name: 'VICTOR HUGO PLAZA DEL PEZO',
      username: 'victorplaza',
      cedula: '0910949221',
      correo: 'victorplaza@alux.com',
      telefono: '0910949221',
      roleName: 'Trabajador',
      roleId: trabajadorRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },
    {
      name: 'JAVIER ALEXANDER HERRERA ZUÑIGA',
      username: 'javierherrera',
      cedula: '0928890128',
      correo: 'javierherrera@alux.com',
      telefono: '0928890128',
      roleName: 'Trabajador',
      roleId: trabajadorRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },
    {
      name: 'LUIS ALFREDO VALENCIA QUINTANA',
      username: 'luisvalencia',
      cedula: '0929782894',
      correo: 'luisvalencia@alux.com',
      telefono: '0929782894',
      roleName: 'Trabajador',
      roleId: trabajadorRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },
    {
      name: 'CHRISTIAN JACINTO MURILLO MIELES',
      username: 'christianmurillo',
      cedula: '0922193834',
      correo: 'christianmurillo@alux.com',
      telefono: '0922193834',
      roleName: 'Trabajador',
      roleId: trabajadorRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },
    {
      name: 'DARIO TEILER PILCO MARIDUEÑA',
      username: 'dariopilco',
      cedula: '0927983528',
      correo: 'dariopilco@alux.com',
      telefono: '0927983528',
      roleName: 'Trabajador',
      roleId: trabajadorRole.id,
      tipoContrato: 'Fijo',
      sueldoDiario: 15.67,
    },
  ];

  for (let i = 0; i < aluxEmployees.length; i++) {
    const person = aluxEmployees[i];
    const idNum = (i + 1).toString().padStart(3, '0');
    const empId = `EMP-${idNum}`;
    const usrId = `USR-${idNum}`;

    console.log(`- Creando Empleado: ${person.name} | Usuario: ${person.username} (${person.roleName})`);

    await prisma.empleado.create({
      data: {
        id: empId,
        nombre: person.name,
        cedula: person.cedula,
        correo: person.correo,
        telefono: person.telefono,
        tipoContrato: person.tipoContrato,
        tieneContrato: true,
        region: 'costa',
        sueldoDiario: person.sueldoDiario,
        autoAsistencia: false,
        passwordHash: passwordHash
      }
    });

    await prisma.user.create({
      data: {
        id: usrId,
        nombre: person.name,
        email: person.correo,
        username: person.username,
        rol: person.roleName,
        roleId: person.roleId,
        estado: 'activo',
        passwordHash: passwordHash,
        empleadoId: empId
      }
    });
  }

  // 8. Usuario Superadmin del Sistema
  console.log('- Creando Usuario Superadmin: admin | Contraseña: admin (Rol: Administrador)');
  const adminPasswordHash = await bcrypt.hash('admin', 10);
  await prisma.user.create({
    data: {
      id: 'USR-ADMIN-001',
      nombre: 'Administrador ALUX',
      email: 'admin@alux.com',
      username: 'admin',
      rol: 'Administrador',
      roleId: adminRole.id,
      estado: 'activo',
      passwordHash: adminPasswordHash,
    },
  });

  // 9. Usuario Kiosco de Asistencia
  console.log('- Creando Usuario Kiosco: asistencia | Contraseña: 123456 (Rol: asistencia)');
  await prisma.user.create({
    data: {
      id: 'USR-ASIS-001',
      nombre: 'Asistencia Kiosco',
      email: 'asistencia@alux.com',
      username: 'asistencia',
      rol: 'asistencia',
      roleId: null,
      estado: 'activo',
      passwordHash: passwordHash,
    },
  });

  console.log('=== Sembrado ALUX finalizado con éxito ===');
}

main()
  .catch((e) => {
    console.error('Error sembrando datos ALUX:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
