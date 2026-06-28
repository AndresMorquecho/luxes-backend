import type {
  TareasRepositoryPort,
  TareaData,
} from '../../domain/ports/TareasRepositoryPort.js';

export class TareasService {
  constructor(private readonly repo: TareasRepositoryPort) {}

  getTareas(options?: {
    page?: number;
    limit?: number;
    estado?: string;
    prioridad?: string;
    search?: string;
    fechaInicio?: string;
    fechaFin?: string;
  }): Promise<{ items: TareaData[]; total: number }> {
    return this.repo.findAll(options);
  }

  getMisTareas(userId: string, options?: {
    page?: number;
    limit?: number;
    estado?: string;
    prioridad?: string;
    fechaInicio?: string;
    fechaFin?: string;
  }): Promise<{ items: TareaData[]; total: number }> {
    return this.repo.findByUserId(userId, options);
  }

  getTareaById(id: string): Promise<TareaData | null> {
    return this.repo.findById(id);
  }

  async createTarea(data: {
    titulo: string;
    descripcion?: string;
    prioridad?: string;
    fechaLimite?: Date | null;
    creadoPorId: string;
    asignadoA: string[];
  }): Promise<TareaData> {
    if (!data.titulo || !data.titulo.trim()) {
      throw new Error('El título de la tarea es requerido.');
    }
    if (!data.asignadoA || data.asignadoA.length === 0) {
      throw new Error('Debe asignar la tarea a al menos un usuario.');
    }
    const validPrioridades = ['alta', 'media', 'baja'];
    if (data.prioridad && !validPrioridades.includes(data.prioridad)) {
      throw new Error('La prioridad debe ser: alta, media o baja.');
    }
    return this.repo.create(data);
  }

  async updateTarea(id: string, data: {
    titulo?: string;
    descripcion?: string;
    prioridad?: string;
    estado?: string;
    fechaLimite?: Date | null;
    asignadoA?: string[];
  }, updater?: { id: string; rol: string; email: string }): Promise<TareaData> {
    const tarea = await this.repo.findById(id);
    if (!tarea) throw new Error('Tarea no encontrada.');

    const userRole = (updater?.rol || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'administrador';

    if (!isAdmin) {
      // Non-admins can only change the "estado"
      if (
        data.titulo !== undefined ||
        data.descripcion !== undefined ||
        data.prioridad !== undefined ||
        data.fechaLimite !== undefined ||
        data.asignadoA !== undefined
      ) {
        throw new Error('No tienes permisos para modificar los detalles de la tarea.');
      }

      // Verify the user is assigned to the task
      const isAssigned = tarea.asignaciones?.some(a => a.userId === updater?.id);
      if (!isAssigned) {
        throw new Error('No puedes actualizar una tarea que no tienes asignada.');
      }
    }

    // Validate state transitions
    if (data.estado) {
      const validTransitions: Record<string, string[]> = {
        pendiente: ['en_progreso', 'cancelada'],
        en_progreso: ['completada', 'cancelada', 'pendiente'],
        completada: ['pendiente'],   // reopen
        cancelada: ['pendiente'],    // reopen
      };
      const allowed = validTransitions[tarea.estado] || [];
      if (!allowed.includes(data.estado)) {
        throw new Error(`No se puede cambiar de "${tarea.estado}" a "${data.estado}".`);
      }
    }

    return this.repo.update(id, data, updater);
  }

  async deleteTarea(id: string): Promise<void> {
    const tarea = await this.repo.findById(id);
    if (!tarea) throw new Error('Tarea no encontrada.');
    return this.repo.delete(id);
  }

  getStats(userId?: string) {
    return this.repo.getStats(userId);
  }
}
