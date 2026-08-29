export type CalendarioCategoria =
  | 'proyecto'
  | 'instalacion'
  | 'cumpleanos'
  | 'rutina'
  | 'cheque'
  | 'gasto_fijo'
  | 'mantenimiento'
  | 'tarea';

export interface CalendarioEvent {
  id: string;
  titulo: string;
  subtitulo?: string;
  categoria: CalendarioCategoria;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:mm
  color: string;
  badge?: string;
  estado?: string;
  completado?: boolean;
  metadata?: Record<string, any>;
  url?: string;
}

export interface RutinaDTO {
  id: string;
  titulo: string;
  descripcion?: string | null;
  frecuencia: string; // "DIARIA" | "SEMANAL" | "MENSUAL"
  diasSemana: number[]; // [1, 2, 3, 4, 5, 6, 7] (1=Lunes..7=Domingo)
  diaDelMes?: number | null;
  horaNotificacion: string;
  color: string;
  activo: boolean;
  empleadosIds: string[];
  empleados?: Array<{ id: string; nombre: string; foto?: string | null }>;
}
