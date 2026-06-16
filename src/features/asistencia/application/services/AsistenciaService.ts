import { Asistencia } from '../../domain/entities/Asistencia.js';
import { AsistenciaRepositoryPort } from '../../domain/ports/AsistenciaRepositoryPort.js';
import { prisma } from '../../../../config/prismaClient.js';

export const SECUENCIA_MARCACIONES = [
  { tipo: 'ENTRADA', label: 'Entrada' },
  { tipo: 'INICIO_ALMUERZO', label: 'Inicio Almuerzo' },
  { tipo: 'FIN_ALMUERZO', label: 'Fin Almuerzo' },
  { tipo: 'SALIDA', label: 'Salida' },
];

export class AsistenciaService {
  constructor(private readonly asistenciaRepository: AsistenciaRepositoryPort) {}

  async listAsistencias(desdeStr: string, hastaStr: string): Promise<Asistencia[]> {
    const desde = new Date(desdeStr);
    desde.setHours(0, 0, 0, 0);

    const hasta = new Date(hastaStr);
    hasta.setHours(23, 59, 59, 999);

    return this.asistenciaRepository.findAll(desde, hasta);
  }

  async getProximaMarcacion(empleadoId: string): Promise<{ tipo: string; label: string } | null> {
    const todayMarks = await this.asistenciaRepository.findTodayByEmpleado(empleadoId);
    if (todayMarks.length >= 4) {
      return null;
    }
    return SECUENCIA_MARCACIONES[todayMarks.length];
  }

  async getTodayForEmpleado(empleadoId: string): Promise<Asistencia[]> {
    return this.asistenciaRepository.findTodayByEmpleado(empleadoId);
  }


  async registrarAsistencia(input: {
    empleadoId: string;
    ubicacionLat: number | null;
    ubicacionLng: number | null;
  }): Promise<Asistencia> {
    // Verificar que el empleado existe
    const empleado = await prisma.empleado.findUnique({
      where: { id: input.empleadoId },
      select: { nombre: true },
    });

    if (!empleado) {
      throw new Error(`Empleado con ID '${input.empleadoId}' no encontrado en el sistema.`);
    }

    const todayMarks = await this.asistenciaRepository.findTodayByEmpleado(input.empleadoId);
    if (todayMarks.length >= 4) {
      throw new Error(`El colaborador ${empleado.nombre} ya completó las 4 marcaciones del día.`);
    }

    const proxima = SECUENCIA_MARCACIONES[todayMarks.length];
    
    const asistencia = await this.asistenciaRepository.create({
      empleadoId: input.empleadoId,
      tipo: proxima.tipo,
      label: proxima.label,
      fechaHora: new Date().toISOString(),
      ubicacionLat: input.ubicacionLat,
      ubicacionLng: input.ubicacionLng,
    });

    // Añadir el nombre del empleado para la respuesta
    return new Asistencia({
      ...asistencia.toJSON(),
      nombreEmpleado: empleado.nombre,
    });
  }

  async registrarPermiso(input: {
    empleadoId: string;
    fecha: string;
  }): Promise<Asistencia> {
    const empleado = await prisma.empleado.findUnique({
      where: { id: input.empleadoId },
      select: { nombre: true },
    });

    if (!empleado) {
      throw new Error(`Empleado con ID '${input.empleadoId}' no encontrado.`);
    }

    // Calcular inicio y fin del día para la fecha especificada
    const targetDate = new Date(input.fecha + 'T00:00:00');
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const existing = await prisma.asistencia.findFirst({
      where: {
        empleadoId: input.empleadoId,
        fechaHora: {
          gte: start,
          lte: end,
        },
      },
    });

    if (existing) {
      throw new Error(`El colaborador ya tiene registros de asistencia o permisos para el día ${input.fecha}.`);
    }

    const asistencia = await this.asistenciaRepository.create({
      empleadoId: input.empleadoId,
      tipo: 'PERMISO',
      label: 'Permiso Pagado',
      fechaHora: start.toISOString(),
      ubicacionLat: null,
      ubicacionLng: null,
    });

    return new Asistencia({
      ...asistencia.toJSON(),
      nombreEmpleado: empleado.nombre,
    });
  }
}
