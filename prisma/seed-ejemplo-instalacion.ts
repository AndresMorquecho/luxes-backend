/**
 * Proyectos de demostración para el módulo de Instalaciones (Taller).
 * Ejecutar: npm run db:seed-ejemplo-instalacion
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROY_MONTAJE_ID = 'PROY-901';
const PROY_COLA_ID = 'PROY-902';
const PROY_ENCUESTA_ID = 'PROY-903';

/** JPEG 1×1 mínimo para evidencia de prueba */
const EVIDENCIA_DEMO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

async function upsertProyectoDemo(
  id: string,
  data: {
    nombre: string;
    faseActual: string;
    progreso: number;
    prioridad: string;
    descripcion: string;
    datosInstalacion: Record<string, unknown>;
    iniciada: boolean;
    completada: boolean;
    cliente?: {
      nombre: string;
      empresa: string;
      telefono: string;
      email: string;
      direccion: string;
    };
  },
  empleados: Array<{ id: string; nombre: string }>,
) {
  const fechaInicio = new Date('2026-06-20T13:30:00Z');
  const cliente = data.cliente ?? {
    nombre: 'Carlos Mendoza',
    empresa: 'Supermercados La Favorita',
    telefono: '0991234567',
    email: 'carlos.mendoza@lafavorita.ec',
    direccion: 'Av. Francisco de Orellana y Av. 9 de Octubre, Guayaquil',
  };

  await prisma.proyecto.upsert({
    where: { id },
    update: {
      nombre: data.nombre,
      faseActual: data.faseActual,
      progreso: data.progreso,
      prioridad: data.prioridad,
      descripcion: data.descripcion,
      requiereInstalacion: true,
      estado: 'ACTIVO',
      clienteNombre: cliente.nombre,
      clienteEmpresa: cliente.empresa,
      clienteTelefono: cliente.telefono,
      clienteEmail: cliente.email,
      clienteDireccion: cliente.direccion,
      responsable: 'María Fernanda Torres',
      montoEstimado: 2850,
      fechaEntregaEstimada: new Date('2026-06-28'),
    },
    create: {
      id,
      nombre: data.nombre,
      faseActual: data.faseActual,
      progreso: data.progreso,
      prioridad: data.prioridad,
      descripcion: data.descripcion,
      requiereInstalacion: true,
      estado: 'ACTIVO',
      clienteNombre: cliente.nombre,
      clienteEmpresa: cliente.empresa,
      clienteTelefono: cliente.telefono,
      clienteEmail: cliente.email,
      clienteDireccion: cliente.direccion,
      responsable: 'María Fernanda Torres',
      montoEstimado: 2850,
      fechaEntregaEstimada: new Date('2026-06-28'),
    },
  });

  const datosJson = JSON.stringify(data.datosInstalacion);

  await prisma.proyectoFase.upsert({
    where: {
      proyectoId_fase: { proyectoId: id, fase: 'INSTALACION' },
    },
    update: {
      completada: data.completada,
      fechaCompletada: data.completada ? new Date() : null,
      datos: datosJson,
    },
    create: {
      proyectoId: id,
      fase: 'INSTALACION',
      completada: data.completada,
      fechaCompletada: data.completada ? new Date() : null,
      datos: datosJson,
    },
  });

  const personal = data.datosInstalacion.personalAsignado as Array<{
    empleadoId: string;
    nombre: string;
    rol: string;
  }> | undefined;

  const materiales = data.datosInstalacion.materiales as Array<{
    nombre: string;
    cantidad: number;
    unidad: string;
    observacion?: string;
  }> | undefined;

  const instalacion = await prisma.proyectoInstalacion.upsert({
    where: { proyectoId: id },
    update: {
      fechaInstalacion: data.iniciada ? fechaInicio : null,
      direccionInstalacion: String(data.datosInstalacion.direccionInstalacion || ''),
      notas: String(data.datosInstalacion.notasInstalacion || ''),
      instalacionCompletada: data.completada,
      notasCierre: data.completada ? String(data.datosInstalacion.notasCierre || '') : '',
    },
    create: {
      proyectoId: id,
      fechaInstalacion: data.iniciada ? fechaInicio : null,
      direccionInstalacion: String(data.datosInstalacion.direccionInstalacion || ''),
      notas: String(data.datosInstalacion.notasInstalacion || ''),
      instalacionCompletada: data.completada,
      notasCierre: data.completada ? String(data.datosInstalacion.notasCierre || '') : '',
    },
  });

  await prisma.proyectoInstalacionPersonal.deleteMany({
    where: { instalacionId: instalacion.id },
  });
  await prisma.proyectoInstalacionMaterial.deleteMany({
    where: { instalacionId: instalacion.id },
  });

  for (const p of personal || []) {
    const emp = empleados.find((e) => e.id === p.empleadoId);
    if (!emp) continue;
    await prisma.proyectoInstalacionPersonal.create({
      data: {
        instalacionId: instalacion.id,
        empleadoId: emp.id,
        rol: p.rol || 'Técnico',
      },
    });
  }

  for (const m of materiales || []) {
    await prisma.proyectoInstalacionMaterial.create({
      data: {
        instalacionId: instalacion.id,
        nombre: m.nombre,
        cantidad: m.cantidad,
        unidad: m.unidad,
        observacion: m.observacion || '',
      },
    });
  }
}

async function main() {
  const empleados = await prisma.empleado.findMany({
    where: { id: { in: ['EMP-TALLER-001', 'EMP-002'] } },
    select: { id: true, nombre: true },
  });

  if (empleados.length < 2) {
    throw new Error(
      'Empleados EMP-TALLER-001 y EMP-002 no encontrados. Ejecuta npm run db:seed',
    );
  }

  const escalera = await prisma.material.findFirst({
    where: { nombre: { contains: 'ESCALERA', mode: 'insensitive' } },
  });
  const taladro = await prisma.material.findFirst({
    where: { nombre: { contains: 'TALADRO', mode: 'insensitive' } },
  });

  const materialesMontaje = [
    escalera && {
      nombre: escalera.nombre,
      sku: escalera.codigo || 'HERR-ESC',
      cantidad: 1,
      unidad: 'unid',
      cantidadLlevada: 1,
      responsable: 'Taller Técnico',
      observacion: 'Para montaje en altura',
      origen: 'inventario',
      tipo: 'herramienta',
    },
    taladro && {
      nombre: taladro.nombre,
      sku: taladro.codigo || 'HERR-TAL',
      cantidad: 1,
      unidad: 'unid',
      cantidadLlevada: 1,
      responsable: 'María Fernanda Torres',
      observacion: 'Fijación de estructura',
      origen: 'inventario',
      tipo: 'herramienta',
    },
  ].filter(Boolean);

  const personalAsignado = [
    {
      empleadoId: 'EMP-TALLER-001',
      nombre: 'Taller Técnico',
      rol: 'Instalador principal',
    },
    {
      empleadoId: 'EMP-002',
      nombre: 'María Fernanda Torres',
      rol: 'Ayudante de montaje',
    },
  ];

  const direccion = 'Centro Comercial Mall del Sol, local 214-B, Guayaquil';

  // 1) Obra en montaje — lista para probar cierre (falta solo confirmar en UI)
  await upsertProyectoDemo(
    PROY_MONTAJE_ID,
    {
      nombre: '[DEMO] Letrero luminoso — Mall del Sol',
      faseActual: 'INSTALACION',
      progreso: 70,
      prioridad: 'ALTA',
      descripcion: 'Instalación de letrero corporativo 4×2 m con iluminación LED.',
      iniciada: true,
      completada: false,
      datosInstalacion: {
        fechaInstalacion: '2026-06-20',
        horaInstalacion: '08:30',
        direccionInstalacion: direccion,
        notasInstalacion:
          'Coordinar con seguridad del mall. Acceso de carga por puerta trasera.',
        personalAsignado,
        materiales: materialesMontaje,
        evidencias: [EVIDENCIA_DEMO],
        instalacionCompletada: false,
      },
    },
    empleados,
  );

  // 2) Obra en cola — pendiente de pulsar "Iniciar Instalación"
  await upsertProyectoDemo(
    PROY_COLA_ID,
    {
      nombre: '[DEMO] Vinilos vitrina — Farmacias Cruz Azul',
      faseActual: 'INSTALACION',
      progreso: 70,
      prioridad: 'MEDIA',
      descripcion: 'Aplicación de vinilos en 3 vitrinas de sucursal norte.',
      iniciada: false,
      completada: false,
      datosInstalacion: {
        direccionInstalacion: 'Av. Juan Tanca Marengo, Guayaquil',
        notasInstalacion: 'Trabajar fuera de horario comercial (después de 20:00).',
        personalAsignado,
        materiales: materialesMontaje.length
          ? [materialesMontaje[0]]
          : [{ nombre: 'Kit herramientas montaje', sku: 'DEMO-01', cantidad: 1, unidad: 'unid', cantidadLlevada: 1, responsable: 'Taller Técnico', origen: 'inventario' }],
        evidencias: [],
        instalacionCompletada: false,
      },
    },
    empleados,
  );

  // 3) Obra en montaje — lista para probar cierre + encuesta WhatsApp (cliente distinto)
  await upsertProyectoDemo(
    PROY_ENCUESTA_ID,
    {
      nombre: '[DEMO] Rótulo fachada — Restaurante El Mariscal',
      faseActual: 'INSTALACION',
      progreso: 70,
      prioridad: 'ALTA',
      descripcion: 'Montaje de rótulo acrílico retroiluminado en fachada principal.',
      iniciada: true,
      completada: false,
      cliente: {
        nombre: 'Andrea Villacís',
        empresa: 'Restaurante El Mariscal',
        telefono: '0987654321',
        email: 'andrea.villacis@elmariscal.ec',
        direccion: 'Urdesa Central, calle Costanera 512, Guayaquil',
      },
      datosInstalacion: {
        fechaInstalacion: '2026-06-24',
        horaInstalacion: '14:00',
        direccionInstalacion: 'Urdesa Central, calle Costanera 512, Guayaquil',
        notasInstalacion: 'Instalación en horario valle. Cliente estará en sitio para recepción.',
        personalAsignado,
        materiales: materialesMontaje,
        evidencias: [EVIDENCIA_DEMO, EVIDENCIA_DEMO],
        instalacionCompletada: false,
      },
    },
    empleados,
  );

  console.log('✓ Proyectos demo de instalación creados:');
  console.log(`  • ${PROY_MONTAJE_ID} — En montaje (listo para cierre de obra)`);
  console.log(`  • ${PROY_COLA_ID} — En cola (pendiente de iniciar)`);
  console.log(`  • ${PROY_ENCUESTA_ID} — En montaje (probar encuesta WhatsApp — Andrea Villacís)`);
  console.log('Inicia sesión como taller / luxes2026 → Instalaciones');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
