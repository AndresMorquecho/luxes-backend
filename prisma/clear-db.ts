import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('Iniciando limpieza de la base de datos...');

  try {
    // 1. Eliminar datos transaccionales de Proyectos
    console.log('Eliminando Proyectos y datos relacionados...');
    await prisma.proyectoInstalacionPersonal.deleteMany();
    await prisma.proyectoInstalacionMaterial.deleteMany();
    await prisma.proyectoInstalacion.deleteMany();
    await prisma.proyectoFase.deleteMany();
    
    // 2. Eliminar Impresiones
    console.log('Eliminando Trabajos de Impresión...');
    await prisma.impresionJob.deleteMany();

    // 3. Eliminar Gastos
    console.log('Eliminando Gastos y Mantenimientos...');
    await prisma.vehiculoMantenimiento.deleteMany();
    await prisma.vehiculo.deleteMany();
    await prisma.gasto.deleteMany();

    // 4. Eliminar Compras y Cuentas por Pagar
    console.log('Eliminando Órdenes de Compra y Cuentas por Pagar...');
    await prisma.abonoCompra.deleteMany();
    await prisma.detalleCompra.deleteMany();
    await prisma.cuentaPorPagar.deleteMany();
    await prisma.ordenCompra.deleteMany();
    await prisma.proveedor.deleteMany();

    // 5. Eliminar Ventas / Proformas
    console.log('Eliminando Proformas y Clientes...');
    await prisma.abonoProforma.deleteMany();
    await prisma.proformaItem.deleteMany();
    await prisma.proforma.deleteMany();
    
    // Eliminar Proyectos (ahora que ya no hay referencias de gastos, proformas, etc)
    await prisma.proyecto.deleteMany();
    
    await prisma.cliente.deleteMany();

    // 6. Eliminar Movimientos de Inventario y Préstamos
    console.log('Eliminando Movimientos de Inventario y Préstamos...');
    await prisma.movimientoInventario.deleteMany();
    await prisma.prestamo.deleteMany();

    // Resetear el stock a 0 en el inventario, pero mantener herramientas y valor
    console.log('Reseteando stock de inventario a 0...');
    await prisma.material.updateMany({
      data: {
        stockActual: 0,
      }
    });

    // 7. Eliminar datos transaccionales de Nómina y RRHH
    console.log('Eliminando registros de Nómina y RRHH (manteniendo Empleados y Asistencias)...');
    await prisma.horaExtra.deleteMany();
    await prisma.nominaRegistro.deleteMany();
    await prisma.egreso.deleteMany();
    await prisma.ingresoDetalle.deleteMany();
    await prisma.vacacion.deleteMany();

    // 8. Eliminar Tareas
    console.log('Eliminando Tareas...');
    await prisma.tareaAsignacion.deleteMany();
    await prisma.tarea.deleteMany();

    // 9. Eliminar Notificaciones y Logs
    console.log('Eliminando Notificaciones, Cierres de Caja y Logs...');
    await prisma.notification.deleteMany();
    await prisma.pushSubscription.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.cierreCaja.deleteMany();

    console.log('==================================================');
    console.log('✅ Base de datos limpiada exitosamente.');
    console.log('Se mantuvieron:');
    console.log(' - Usuarios, Roles, Permisos');
    console.log(' - Empleados y sus registros de Asistencia');
    console.log(' - Inventario (Herramientas/Materiales) con stock en 0 pero con sus precios');
    console.log(' - Métodos de Pago (Balances reseteados al eliminar transacciones)');
    console.log(' - Configuraciones Globales');
    console.log('==================================================');

  } catch (error) {
    console.error('Error durante la limpieza de la base de datos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
