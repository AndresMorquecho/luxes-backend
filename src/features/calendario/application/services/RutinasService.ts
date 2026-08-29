import { prisma } from '../../../../config/prismaClient.js';

export class RutinasService {
  async listRutinas() {
    const rutinas = await (prisma as any).rutina.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        asignaciones: {
          include: {
            empleado: {
              select: {
                id: true,
                nombre: true,
                foto: true,
              },
            },
          },
        },
      },
    });

    return rutinas.map((r: any) => {
      let turnosPorDia: Record<string, string[]> = {};
      try {
        const parsed = JSON.parse(r.diasSemana || '{}');
        if (Array.isArray(parsed)) {
          const allEmpIds = r.asignaciones.map((a: any) => a.empleadoId);
          parsed.forEach((day: number) => {
            turnosPorDia[String(day)] = allEmpIds;
          });
        } else if (typeof parsed === 'object' && parsed !== null) {
          turnosPorDia = parsed;
        }
      } catch {
        turnosPorDia = {};
      }

      return {
        ...r,
        turnosPorDia,
        empleados: r.asignaciones.map((a: any) => a.empleado),
      };
    });
  }

  async getRutinaById(id: string) {
    const r = await (prisma as any).rutina.findUnique({
      where: { id },
      include: {
        asignaciones: {
          include: {
            empleado: {
              select: {
                id: true,
                nombre: true,
                foto: true,
              },
            },
          },
        },
        historial: {
          orderBy: { fecha: 'desc' },
          take: 30,
        },
      },
    });

    if (!r) return null;

    let turnosPorDia: Record<string, string[]> = {};
    try {
      const parsed = JSON.parse(r.diasSemana || '{}');
      if (Array.isArray(parsed)) {
        const allEmpIds = r.asignaciones.map((a: any) => a.empleadoId);
        parsed.forEach((day: number) => {
          turnosPorDia[String(day)] = allEmpIds;
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        turnosPorDia = parsed;
      }
    } catch {
      turnosPorDia = {};
    }

    return {
      ...r,
      turnosPorDia,
      empleados: r.asignaciones.map((a: any) => a.empleado),
    };
  }

  async createRutina(data: {
    titulo: string;
    descripcion?: string;
    frecuencia?: string;
    diasSemana?: any;
    turnosPorDia?: Record<string, string[]>;
    diaDelMes?: number;
    horaNotificacion?: string;
    color?: string;
    activo?: boolean;
    empleadosIds?: string[];
    creadoPorId?: string;
  }) {
    const turnos = data.turnosPorDia || {};
    
    // Extract unique employee IDs across all days
    const uniqueEmpIds = new Set<string>();
    Object.values(turnos).forEach((list) => {
      if (Array.isArray(list)) {
        list.forEach((id) => uniqueEmpIds.add(id));
      }
    });

    if (Array.isArray(data.empleadosIds)) {
      data.empleadosIds.forEach((id) => uniqueEmpIds.add(id));
    }

    const turnosJson = JSON.stringify(turnos);

    const rutina = await (prisma as any).rutina.create({
      data: {
        titulo: data.titulo,
        descripcion: data.descripcion || null,
        frecuencia: data.frecuencia || 'SEMANAL',
        diasSemana: turnosJson,
        diaDelMes: data.diaDelMes || null,
        horaNotificacion: data.horaNotificacion || '08:30',
        color: data.color || '#0b2d64',
        activo: data.activo !== undefined ? data.activo : true,
        creadoPorId: data.creadoPorId || null,
      },
    });

    if (uniqueEmpIds.size > 0) {
      await (prisma as any).rutinaAsignacion.createMany({
        data: Array.from(uniqueEmpIds).map((empId) => ({
          rutinaId: rutina.id,
          empleadoId: empId,
        })),
        skipDuplicates: true,
      });
    }

    return this.getRutinaById(rutina.id);
  }

  async updateRutina(
    id: string,
    data: {
      titulo?: string;
      descripcion?: string;
      frecuencia?: string;
      diasSemana?: any;
      turnosPorDia?: Record<string, string[]>;
      diaDelMes?: number;
      horaNotificacion?: string;
      color?: string;
      activo?: boolean;
      empleadosIds?: string[];
    }
  ) {
    const turnos = data.turnosPorDia;
    let turnosJson: string | undefined = undefined;
    let uniqueEmpIds: Set<string> | null = null;

    if (turnos) {
      uniqueEmpIds = new Set<string>();
      Object.values(turnos).forEach((list) => {
        if (Array.isArray(list)) {
          list.forEach((id) => uniqueEmpIds?.add(id));
        }
      });
      turnosJson = JSON.stringify(turnos);
    } else if (data.diasSemana) {
      turnosJson = typeof data.diasSemana === 'string' ? data.diasSemana : JSON.stringify(data.diasSemana);
    }

    if (Array.isArray(data.empleadosIds)) {
      if (!uniqueEmpIds) uniqueEmpIds = new Set<string>();
      data.empleadosIds.forEach((id) => uniqueEmpIds?.add(id));
    }

    await (prisma as any).rutina.update({
      where: { id },
      data: {
        titulo: data.titulo,
        descripcion: data.descripcion !== undefined ? data.descripcion : undefined,
        frecuencia: data.frecuencia,
        diasSemana: turnosJson,
        diaDelMes: data.diaDelMes !== undefined ? data.diaDelMes : undefined,
        horaNotificacion: data.horaNotificacion,
        color: data.color,
        activo: data.activo,
      },
    });

    if (uniqueEmpIds !== null) {
      await (prisma as any).rutinaAsignacion.deleteMany({
        where: { rutinaId: id },
      });

      if (uniqueEmpIds.size > 0) {
        await (prisma as any).rutinaAsignacion.createMany({
          data: Array.from(uniqueEmpIds).map((empId) => ({
            rutinaId: id,
            empleadoId: empId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.getRutinaById(id);
  }

  async deleteRutina(id: string) {
    await (prisma as any).rutina.delete({
      where: { id },
    });
    return { deleted: true };
  }

  async toggleCompletada(rutinaId: string, fechaStr: string, empleadoId?: string, notas?: string) {
    const fecha = new Date(fechaStr + 'T00:00:00.000Z');

    const existing = await (prisma as any).rutinaHistorial.findUnique({
      where: {
        rutinaId_fecha: {
          rutinaId,
          fecha,
        },
      },
    });

    if (existing) {
      const updated = await (prisma as any).rutinaHistorial.update({
        where: { id: existing.id },
        data: {
          completada: !existing.completada,
          completadaAt: !existing.completada ? new Date() : null,
          completadaPorId: !existing.completada ? empleadoId || null : null,
          notas: notas !== undefined ? notas : existing.notas,
        },
      });
      return updated;
    } else {
      const created = await (prisma as any).rutinaHistorial.create({
        data: {
          rutinaId,
          fecha,
          completada: true,
          completadaAt: new Date(),
          completadaPorId: empleadoId || null,
          notas: notas || null,
        },
      });
      return created;
    }
  }
}
