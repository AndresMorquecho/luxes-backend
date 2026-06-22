// ── Domain types ────────────────────────────────────────────────────────────

export interface TareaAsignacionData {
  id: string;
  tareaId: string;
  userId: string;
  user?: { id: string; nombre: string; email: string; username: string };
}

export interface TareaData {
  id: string;
  titulo: string;
  descripcion?: string | null;
  prioridad: string;       // "alta", "media", "baja"
  estado: string;          // "pendiente", "en_progreso", "completada", "cancelada"
  fechaLimite?: Date | null;
  creadoPorId: string;
  creadoPor?: { id: string; nombre: string; email: string };
  fechaCreacion: Date;
  fechaActualizacion?: Date | null;
  asignaciones?: TareaAsignacionData[];
}

export interface TareasRepositoryPort {
  findAll(options?: {
    page?: number;
    limit?: number;
    estado?: string;
    prioridad?: string;
    search?: string;
  }): Promise<{ items: TareaData[]; total: number }>;

  findByUserId(userId: string, options?: {
    page?: number;
    limit?: number;
    estado?: string;
    prioridad?: string;
  }): Promise<{ items: TareaData[]; total: number }>;

  findById(id: string): Promise<TareaData | null>;

  create(data: {
    titulo: string;
    descripcion?: string;
    prioridad?: string;
    fechaLimite?: Date | null;
    creadoPorId: string;
    asignadoA: string[];  // array of user IDs
  }): Promise<TareaData>;

  update(id: string, data: {
    titulo?: string;
    descripcion?: string;
    prioridad?: string;
    estado?: string;
    fechaLimite?: Date | null;
    asignadoA?: string[];
  }, updater?: { id: string; rol: string; email: string }): Promise<TareaData>;

  delete(id: string): Promise<void>;

  getStats(userId?: string): Promise<{
    total: number;
    pendientes: number;
    enProgreso: number;
    completadas: number;
    canceladas: number;
  }>;
}
