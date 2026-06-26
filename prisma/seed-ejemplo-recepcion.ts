/**
 * Orden de compra de ejemplo con 3 productos, lista para "Recibir productos".
 * Ejecutar: npm run db:seed-ejemplo-recepcion
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORDEN_ID = 'oc-ejemplo-3-productos';
const ORDEN_NUMERO = 'OC-2026-DEMO';

const PRODUCTOS = [
  {
    id: 'det-ejemplo-lona',
    descripcion: 'Lona brillo - 1.5m',
    codigoMaterial: 'LOBR-1.5',
    cantidad: 50,
    precioUnitario: 3.0,
  },
  {
    id: 'det-ejemplo-vinil',
    descripcion: 'Vinil brillo - 1.2m',
    codigoMaterial: 'VNBR-1.2',
    cantidad: 30,
    precioUnitario: 2.5,
  },
  {
    id: 'det-ejemplo-tinta',
    descripcion: 'Tinta solvente Magenta',
    codigoMaterial: 'INK-MAG',
    cantidad: 4,
    precioUnitario: 28.0,
  },
] as const;

async function main() {
  const [solicitante, aprobador, proveedor] = await Promise.all([
    prisma.user.findFirst({
      where: { username: { in: ['impresion', 'Impresion'] } },
    }),
    prisma.user.findFirst({
      where: { username: { in: ['admin', 'administrador'] } },
    }),
    prisma.proveedor.findFirst({
      where: { ruc: '0991728394001' },
    }),
  ]);

  if (!solicitante) {
    throw new Error('Usuario impresion no encontrado. Ejecuta npm run db:ensure-role-users');
  }
  if (!aprobador) {
    throw new Error('Usuario admin no encontrado.');
  }
  if (!proveedor) {
    throw new Error('Proveedor de ejemplo no encontrado. Ejecuta npm run db:seed');
  }

  const materiales = await Promise.all(
    PRODUCTOS.map((p) =>
      prisma.material.findFirst({ where: { codigo: p.codigoMaterial } })
    )
  );

  const faltantes = PRODUCTOS.filter((_, i) => !materiales[i]).map((p) => p.codigoMaterial);
  if (faltantes.length > 0) {
    throw new Error(
      `Materiales no encontrados (${faltantes.join(', ')}). Ejecuta npm run db:seed primero.`
    );
  }

  const subtotal = PRODUCTOS.reduce((s, p) => s + p.cantidad * p.precioUnitario, 0);
  const impuesto = Math.round(subtotal * 0.12 * 100) / 100;
  const total = Math.round((subtotal + impuesto) * 100) / 100;

  await prisma.ordenCompra.upsert({
    where: { numero: ORDEN_NUMERO },
    update: {
      proveedorId: proveedor.id,
      usuarioId: solicitante.id,
      aprobadoPorId: aprobador.id,
      fechaAprobacion: new Date(),
      subtotal,
      impuesto,
      total,
      estado: 'aprobada',
      estadoPago: 'sin_pagar',
      concepto: 'Ejemplo: insumos gráficos para recibir producto por producto',
      notas: 'Orden demo con 3 productos (lona, vinil y tinta).',
      fechaRecepcion: null,
      notasRecepcion: null,
      recibidoPorId: null,
    },
    create: {
      id: ORDEN_ID,
      numero: ORDEN_NUMERO,
      proveedorId: proveedor.id,
      usuarioId: solicitante.id,
      aprobadoPorId: aprobador.id,
      fechaAprobacion: new Date(),
      fecha: new Date(),
      subtotal,
      impuesto,
      total,
      estado: 'aprobada',
      estadoPago: 'sin_pagar',
      concepto: 'Ejemplo: insumos gráficos para recibir producto por producto',
      notas: 'Orden demo con 3 productos (lona, vinil y tinta).',
    },
  });

  const orden = await prisma.ordenCompra.findUnique({
    where: { numero: ORDEN_NUMERO },
  });
  if (!orden) throw new Error('No se pudo crear la orden de ejemplo.');

  await prisma.detalleCompra.deleteMany({ where: { ordenCompraId: orden.id } });

  for (let i = 0; i < PRODUCTOS.length; i++) {
    const p = PRODUCTOS[i];
    const material = materiales[i]!;
    await prisma.detalleCompra.create({
      data: {
        id: p.id,
        ordenCompraId: orden.id,
        materialId: material.id,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario,
        subtotal: p.cantidad * p.precioUnitario,
        cantidadRecibida: null,
        descargableInventario: null,
        fechaRecepcion: null,
      },
    });
  }

  console.log('');
  console.log('✓ Orden de ejemplo creada correctamente');
  console.log(`  Número:     ${ORDEN_NUMERO}`);
  console.log(`  Estado:     aprobada (3 productos pendientes)`);
  console.log(`  Solicitante: ${solicitante.nombre} (${solicitante.username})`);
  console.log(`  Proveedor:  ${proveedor.nombre}`);
  console.log('  Productos:');
  for (const p of PRODUCTOS) {
    console.log(`    - ${p.descripcion}: ${p.cantidad} u × $${p.precioUnitario.toFixed(2)}`);
  }
  console.log('');
  console.log('  Abre en el portal: Compras → Recibir productos');
  console.log(`  O directo: /compras/recepcion/${orden.id}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
