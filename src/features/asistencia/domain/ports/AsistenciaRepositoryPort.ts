import { Asistencia, AsistenciaProps } from '../entities/Asistencia.js';

export interface AsistenciaInput {
  empleadoId: string;
  tipo: string;
  label: string;
  fechaHora: string;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
}

export abstract class AsistenciaRepositoryPort {
  abstract findAll(desde: Date, hasta: Date): Promise<Asistencia[]>;
  abstract findTodayByEmpleado(empleadoId: string): Promise<Asistencia[]>;
  abstract create(data: AsistenciaInput): Promise<Asistencia>;
}
