import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
    {
      name: 'IVETTE STEPHANIA MORQUECHO SEVILLANO',
      username: 'ivettemorquecho',
      cedula: '0903953779',
      celular: '0988791080',
      tipoContrato: 'Fijo',
      roleName: 'Administrador',
      roleId: adminRole.id,
      correo: 'morquecho_ivette@hotmail.com'
    },
    {
      name: 'CHRISTIAN MANUEL PAREDES ARMIJOS',
      username: 'christianparedes',
      cedula: '0942234345',
      celular: '0959064260',
      tipoContrato: 'Fijo',
      roleName: 'Impresión',
      roleId: impresionRole.id,
      correo: 'christianparedes@hotmail.com'
    },
    {
      name: 'PAOLA ELIZABETH CARRANZA VILLALTA',
      username: 'paolacarranza',
      cedula: '0940814924',
      celular: '0988975320',
      tipoContrato: 'Eventual',
      roleName: 'Ventas',
      roleId: ventasRole.id,
      correo: 'paola.1997carranza@gmail.com'
    },
    {
      name: 'MAYBE BRIGGITTE ORELLANA MANOBANDA',
      username: 'maybeorellana',
      cedula: '0923900880',
      celular: '0982861333',
      tipoContrato: 'Eventual',
      roleName: 'Ventas',
      roleId: ventasRole.id,
      correo: 'maybe_lovebriggi@gmail.com'
    },
    {
      name: 'JULEYSI EFIGENIA OVERA GARCIA',
      username: 'juleysiovera',
      cedula: '0105773196',
      celular: '0963240770',
      tipoContrato: 'Eventual',
      roleName: 'Ventas',
      roleId: ventasRole.id,
      correo: 'juleysiovera@gmail.com'
    },
    {
      name: 'JOSE ANDRE TAMAYO ORTEGA',
      username: 'josetamayo',
      cedula: '0955766639',
      celular: '0986312327',
      tipoContrato: 'Eventual',
      roleName: 'Diseñador',
      roleId: disenadorRole.id,
      correo: 'anddretamayo@gmail.com'
    },
    {
      name: 'NARCISA CARMEN REINA PILOZO',
      username: 'narcisareina',
      cedula: '0940168065',
      celular: '0983839545',
      tipoContrato: 'Eventual',
      roleName: 'Administrador',
      roleId: adminRole.id,
      correo: 'reina-narcisa1@gmail.com'
    },
    {
      name: 'NESTOR JIMMY EVANGELISTA ORTIZ',
      username: 'jimmyevangelista',
      cedula: '0926245770',
      celular: '0987655311',
      tipoContrato: 'Eventual',
      roleName: 'Taller',
      roleId: tallerRole.id,
      correo: 'njimmy86@hotmail.com'
    },
    {
      name: 'JOSE ANDRES JEREZ VITERI',
      username: 'josejerez',
      cedula: '0350317483',
      celular: '0980821596',
      tipoContrato: 'Eventual',
      roleName: 'Taller',
      roleId: tallerRole.id,
      correo: 'josejerez1054@gmail.com'
    },
    {
      name: 'DIXON EDINSON MONCADA ATOCHA',
      username: 'dixonmoncada',
      cedula: '0940168594',
      celular: '0997346212',
      tipoContrato: 'Eventual',
      roleName: 'Taller',
      roleId: tallerRole.id,
      correo: 'edinson.moncada@gmail.com'
    }
  ];

  for (let i = 0; i < rawPeople.length; i++) {
    const person = rawPeople[i];
    const username = person.username;
    const idNum = (i + 1).toString().padStart(3, '0');
    const empId = `EMP-${idNum}`;
    const usrId = `USR-${idNum}`;

    console.log(`- Creando Empleado: ${person.name} | Usuario: ${username} (Rol: ${person.roleName})`);

    // Crear Empleado
    await prisma.empleado.create({
      data: {
        id: empId,
        nombre: person.name,
        cedula: person.cedula,
        correo: person.correo,
        telefono: person.celular,
        tipoContrato: person.tipoContrato,
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
        email: person.correo,
        username: username,
        rol: person.roleName,
        roleId: person.roleId,
        estado: 'activo',
        passwordHash: passwordHash,
        empleadoId: empId
      }
    });
  }

  // Usuario de kiosco para registro de asistencia (sin empleado vinculado)
  console.log('- Creando Usuario: asistencia | Contraseña: 123456 (Rol: asistencia)');
  await prisma.user.create({
    data: {
      id: 'USR-ASIS-001',
      nombre: 'Asistencia Kiosco',
      email: 'asistencia@luxes.com',
      username: 'asistencia',
      rol: 'asistencia',
      roleId: null,
      estado: 'activo',
      passwordHash: passwordHash,
    },
  });

  // 6. Sembrar Clientes
  console.log('Sembrando 20 clientes ficticios...');
  const mockClientes = [
    { id: 'CLI-001', nombre: 'Juan Pérez', cedulaRuc: '0928374615', telefono: '0981234567', email: 'juan.perez@example.com', direccion: 'Av. 9 de Octubre 123, Guayaquil', tipo: 'Persona', notas: 'Cliente recurrente e interesado en proformas de mobiliario.' },
    { id: 'CLI-002', nombre: 'María Rodríguez', cedulaRuc: '1738495061', telefono: '0982345678', email: 'maria.rod@example.com', direccion: 'Av. Amazonas N24-10, Quito', tipo: 'Persona', notas: 'Contacto principal para proyectos de iluminación.' },
    { id: 'CLI-003', nombre: 'Corporación Noboa S.A.', cedulaRuc: '0991234567001', telefono: '042202020', email: 'compras@noboa.com', direccion: 'Km 5.5 Vía a Daule, Guayaquil', tipo: 'Empresa', notas: 'Cliente corporativo VIP.' },
    { id: 'CLI-004', nombre: 'Carlos Mendoza', cedulaRuc: '1309876543', telefono: '0983456789', email: 'carlos.men@example.com', direccion: 'Calle 13 y Av. 24, Manta', tipo: 'Persona', notas: 'Solicita cotización de proformas de taller.' },
    { id: 'CLI-005', nombre: 'Ana María Silva', cedulaRuc: '0104728394', telefono: '0984567890', email: 'ana.silva@example.com', direccion: 'Gran Colombia 4-56, Cuenca', tipo: 'Persona', notas: 'Cliente residencial para acabados de lujo.' },
    { id: 'CLI-006', nombre: 'Constructora del Pacífico', cedulaRuc: '1792345678001', telefono: '022505050', email: 'proyectos@conpacifico.com', direccion: 'Av. 12 de Octubre, Quito', tipo: 'Empresa', notas: 'Proyectos de gran escala, pagos a 30 días.' },
    { id: 'CLI-007', nombre: 'David Chango', cedulaRuc: '1802938475', telefono: '0985678901', email: 'david.chango@example.com', direccion: 'Av. Cevallos y Montalvo, Ambato', tipo: 'Persona', notas: 'Interesado en señalización y gigantografías.' },
    { id: 'CLI-008', nombre: 'Sofía Larrea', cedulaRuc: '1728374950', telefono: '0986789012', email: 'sofia.lar@example.com', direccion: 'Cumbayá, San Juan s/n, Quito', tipo: 'Persona', notas: 'Proyectos de diseño de interiores.' },
    { id: 'CLI-009', nombre: 'Hotel Oro Verde', cedulaRuc: '0990876543001', telefono: '042327999', email: 'mantenimiento@oroverde.com.ec', direccion: 'Av. 9 de Octubre y García Moreno, Guayaquil', tipo: 'Empresa', notas: 'Mantenimientos y adecuaciones frecuentes.' },
    { id: 'CLI-010', nombre: 'Luis Fernando Castro', cedulaRuc: '0912345678', telefono: '0987890123', email: 'luis.castro@example.com', direccion: 'Urdesa Central, Calle Ilanes, Guayaquil', tipo: 'Persona', notas: 'Entrega en oficina central.' },
    { id: 'CLI-011', nombre: 'Inmobiliaria Novatec', cedulaRuc: '1798765432001', telefono: '022998877', email: 'info@novatec.ec', direccion: 'Av. Eloy Alfaro y Shyris, Quito', tipo: 'Empresa', notas: 'Proyectos residenciales nuevos.' },
    { id: 'CLI-012', nombre: 'Gabriela Ponce', cedulaRuc: '0919283746', telefono: '0988901234', email: 'gabriela.p@example.com', direccion: 'Samanes 6, Mz. 102 V. 5, Guayaquil', tipo: 'Persona', notas: 'Consumo mensual de impresiones y vinilos.' },
    { id: 'CLI-013', nombre: 'Supermercados La Favorita', cedulaRuc: '1790016919001', telefono: '022997700', email: 'proveedores@favorita.com.ec', direccion: 'Av. General Enríquez, Sangolquí', tipo: 'Empresa', notas: 'Cliente corporativo premium.' },
    { id: 'CLI-014', nombre: 'Andrés Vera', cedulaRuc: '1319283746', telefono: '0989012345', email: 'andres.vera@example.com', direccion: 'Av. Flavio Reyes, Manta', tipo: 'Persona', notas: 'Instalaciones publicitarias.' },
    { id: 'CLI-015', nombre: 'Patricia Espinoza', cedulaRuc: '1102938475', telefono: '0980123456', email: 'patty.es@example.com', direccion: 'Calle Bolívar y 10 de Agosto, Loja', tipo: 'Persona', notas: 'Cliente particular.' },
    { id: 'CLI-016', nombre: 'Almacenes Estuardo Sánchez', cedulaRuc: '0990012345001', telefono: '042594500', email: 'compras@estuardo.com.ec', direccion: 'Luque y Chimborazo, Guayaquil', tipo: 'Empresa', notas: 'Instalaciones de letreros en locales a nivel nacional.' },
    { id: 'CLI-017', nombre: 'Roberto Gómez', cedulaRuc: '0921029384', telefono: '0981230987', email: 'roberto.gomez@example.com', direccion: 'Samborondón Km 2.5, Guayaquil', tipo: 'Persona', notas: 'Pedidos especiales de carpintería y metalmecánica.' },
    { id: 'CLI-018', nombre: 'Boutique Glamour', cedulaRuc: '0928374650001', telefono: '0982341234', email: 'admin@glamourboutique.com', direccion: 'Mall del Sol Local 45, Guayaquil', tipo: 'Empresa', notas: 'Diseño e impresión de publicidad estacional.' },
    { id: 'CLI-019', nombre: 'Javier Ceballos', cedulaRuc: '1710293847', telefono: '0983452345', email: 'javier.ceb@example.com', direccion: 'La Carolina, Av. República, Quito', tipo: 'Persona', notas: 'Cliente de proyectos especiales.' },
    { id: 'CLI-020', nombre: 'Clínica Kennedy', cedulaRuc: '0990123456001', telefono: '042289666', email: 'logistica@kennedy.com.ec', direccion: 'Av. San Jorge, Guayaquil', tipo: 'Empresa', notas: 'Señalética interna de consultorios.' }
  ];

  for (const cliente of mockClientes) {
    await prisma.cliente.create({
      data: cliente
    });
  }

  // 7. Sembrar Proveedores
  console.log('Sembrando 10 proveedores ficticios...');
  const mockProveedores = [
    { id: 'PRV-001', nombre: 'Importadora Alvarado', ruc: '1890123456001', tipo: 'Empresa', direccion: 'Av. de las Américas, Ambato', telefono: '032824500', email: 'ventas@alvarado.com', contacto: 'Santiago Alvarado', notas: 'Proveedor principal de perfiles de aluminio y herrajes.', estado: 'activo' },
    { id: 'PRV-002', nombre: 'Distribuidora Ferretera del Sur', ruc: '0190123456001', tipo: 'Empresa', direccion: 'Av. Remigio Crespo, Cuenca', telefono: '072814300', email: 'pedidos@ferresur.com', contacto: 'Patricia Muñoz', notas: 'Tornillería, herramientas manuales y consumibles de taller.', estado: 'activo' },
    { id: 'PRV-003', nombre: 'Plásticos Industriales Ecuatorianos', ruc: '1790123456001', tipo: 'Empresa', direccion: 'Vía Chillo Jijón, Sangolquí', telefono: '022330900', email: 'ventas@plasticosec.com', contacto: 'Ing. Carlos Ortiz', notas: 'Láminas de acrílico, policarbonato y PVC espumado.', estado: 'activo' },
    { id: 'PRV-004', nombre: 'Pinturas Cóndor', ruc: '1790012345001', tipo: 'Empresa', direccion: 'Panamericana Norte Km 11.5, Quito', telefono: '022485000', email: 'distribucion@condor.com.ec', contacto: 'Jorge Maldonado', notas: 'Pinturas automotrices, esmaltes y solventes.', estado: 'activo' },
    { id: 'PRV-005', nombre: 'Madera y Tableros Novopan', ruc: '1790111222001', tipo: 'Empresa', direccion: 'Km 12 Vía Aloag, Mejía', telefono: '022380100', email: 'ventas@novopan.com.ec', contacto: 'Andrea Ramos', notas: 'Planchas de MDF, MDP y melamina de varios espesores y diseños.', estado: 'activo' },
    { id: 'PRV-006', nombre: 'Vidriería Nacional Vidriocar', ruc: '0990123456001', tipo: 'Empresa', direccion: 'Av. Juan Tanca Marengo, Guayaquil', telefono: '042658900', email: 'despacho@vidriocar.com.ec', contacto: 'Esteban Falconí', notas: 'Vidrios templados, flotados y espejos a medida.', estado: 'activo' },
    { id: 'PRV-007', nombre: 'MegaMetales S.A.', ruc: '0990888999001', tipo: 'Empresa', direccion: 'Km 10.5 Vía a Daule, Guayaquil', telefono: '042112233', email: 'info@megametales.com', contacto: 'Luis Villacís', notas: 'Tuberías de acero, planchas de hierro negro y galvanizado.', estado: 'activo' },
    { id: 'PRV-008', nombre: 'Suministros Gráficos Ecuagráficos', ruc: '1791222333001', tipo: 'Empresa', direccion: 'Av. de la Prensa, Quito', telefono: '022445566', email: 'ventas@ecuagraficos.ec', contacto: 'Diana Ruiz', notas: 'Vinilos adhesivos, lonas para banner y tintas de impresión.', estado: 'activo' },
    { id: 'PRV-009', nombre: 'Leds & Luces del Ecuador', ruc: '0928374651001', tipo: 'Persona', direccion: 'Bahía, Calle Chimborazo, Guayaquil', telefono: '0998877665', email: 'leds.luces@gmail.com', contacto: 'Manuel Coello', notas: 'Módulos LED, cintas LED, fuentes de poder y controladores.', estado: 'activo' },
    { id: 'PRV-010', nombre: 'Seguridad Industrial Ecuatoriana', ruc: '1791888222001', tipo: 'Empresa', direccion: 'Av. 10 de Agosto, Quito', telefono: '022556677', email: 'equipos@seguridadec.com', contacto: 'Marta Solís', notas: 'Cascos, guantes, arneses y botas de seguridad para los instaladores.', estado: 'activo' }
  ];

  for (const proveedor of mockProveedores) {
    await prisma.proveedor.create({
      data: proveedor
    });
  }

  // 8. Sembrar Unidades de Medida
  console.log('Sembrando unidades de medida...');
  const unidades = [
    { id: 'UM-001', nombre: 'Unidad', abreviacion: 'und' },
    { id: 'UM-002', nombre: 'Metro', abreviacion: 'm' },
    { id: 'UM-003', nombre: 'Rollo', abreviacion: 'roll' },
    { id: 'UM-004', nombre: 'Litro', abreviacion: 'L' }
  ];
  for (const u of unidades) {
    await prisma.unidadMedida.create({ data: u });
  }

  // 9. Sembrar Métodos de Pago
  console.log('Sembrando 4 métodos de pago ficticios...');
  const metodosPago = [
    { id: 'MP-001', nombre: 'Efectivo Caja Chica', descripcion: 'Efectivo en caja física', activo: true, tipo: 'EFECTIVO' },
    { id: 'MP-002', nombre: 'Banco Pichincha Corriente', descripcion: 'Cuenta corriente Banco Pichincha', activo: true, tipo: 'BANCO' },
    { id: 'MP-003', nombre: 'Banco Guayaquil Ahorros', descripcion: 'Cuenta de ahorros Banco Guayaquil', activo: true, tipo: 'BANCO' },
    { id: 'MP-004', nombre: 'Tarjeta de Crédito / Datafast', descripcion: 'Cobros con tarjeta de crédito/débito', activo: true, tipo: 'EFECTIVO' }
  ];
  for (const mp of metodosPago) {
    await prisma.metodoPago.create({ data: mp });
  }

  // 10. Sembrar Materiales de Inventario (Taller e Impresión)
  console.log('Sembrando materiales de inventario (Taller e Impresión)...');
  const mockMateriales = [
    // Taller - Herramientas (con responsables)
    { id: 'MAT-001', nombre: 'Taladro Percutor Dewalt', tipo: 'herramienta', unidadMedidaId: 'UM-001', stockActual: 2, stockMinimo: 1, precioCosto: 120.00, categoria: 'Taller', estadoUso: 'EN USO', aCargo: 'ChristhianP' },
    { id: 'MAT-002', nombre: 'Sierra Circular Makita', tipo: 'herramienta', unidadMedidaId: 'UM-001', stockActual: 1, stockMinimo: 1, precioCosto: 180.00, categoria: 'Taller', estadoUso: 'EN USO', aCargo: 'JimmyE' },
    { id: 'MAT-003', nombre: 'Amoladora Bosch 4 1/2', tipo: 'herramienta', unidadMedidaId: 'UM-001', stockActual: 3, stockMinimo: 1, precioCosto: 85.00, categoria: 'Taller', estadoUso: 'BODEGA' },
    
    // Taller - Consumibles
    { id: 'MAT-004', nombre: 'Tornillos Autoperforantes 1 1/2 (Caja x100)', tipo: 'consumible', unidadMedidaId: 'UM-001', stockActual: 15, stockMinimo: 3, precioCosto: 4.50, categoria: 'Taller', estadoUso: 'BODEGA' },
    { id: 'MAT-005', nombre: 'Cola de Madera PVA 1L', tipo: 'consumible', unidadMedidaId: 'UM-004', stockActual: 10, stockMinimo: 2, precioCosto: 6.20, categoria: 'Taller', estadoUso: 'BODEGA' },
    
    // Impresión - Herramientas (con responsables)
    { id: 'MAT-006', nombre: 'Plotter de Corte Mimaki', tipo: 'herramienta', unidadMedidaId: 'UM-001', stockActual: 1, stockMinimo: 1, precioCosto: 2400.00, categoria: 'Impresión', estadoUso: 'EN USO', aCargo: 'CristoferS' },
    { id: 'MAT-007', nombre: 'Pistola de Calor Dewalt', tipo: 'herramienta', unidadMedidaId: 'UM-001', stockActual: 4, stockMinimo: 1, precioCosto: 75.00, categoria: 'Impresión', estadoUso: 'EN USO', aCargo: 'CristoferS' },
    
    // Impresión - Consumibles
    { id: 'MAT-008', nombre: 'Rollo Vinilo Adhesivo Blanco Brillo 1.52m', tipo: 'consumible', unidadMedidaId: 'UM-003', stockActual: 6, stockMinimo: 2, precioCosto: 48.00, categoria: 'Impresión', estadoUso: 'BODEGA' },
    { id: 'MAT-009', nombre: 'Lona para Banner 13oz 3.20m', tipo: 'consumible', unidadMedidaId: 'UM-003', stockActual: 3, stockMinimo: 1, precioCosto: 72.50, categoria: 'Impresión', estadoUso: 'BODEGA' },
    { id: 'MAT-010', nombre: 'Tinta Solvente Cyan 1L', tipo: 'consumible', unidadMedidaId: 'UM-004', stockActual: 12, stockMinimo: 4, precioCosto: 22.00, categoria: 'Impresión', estadoUso: 'BODEGA' }
  ];

  for (const material of mockMateriales) {
    await prisma.material.create({
      data: material
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
