export interface AsistenciaProps {
  id: string;
  empleadoId: string;
  tipo: string;
  label: string;
  fechaHora: string;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  createdAt?: string;
  nombreEmpleado?: string;
}

export class Asistencia {
  readonly id: string;
  readonly empleadoId: string;
  readonly tipo: string;
  readonly label: string;
  readonly fechaHora: string;
  readonly ubicacionLat: number | null;
  readonly ubicacionLng: number | null;
  readonly createdAt?: string;
  readonly nombreEmpleado?: string;

  constructor(props: AsistenciaProps) {
    this.id = props.id;
    this.empleadoId = props.empleadoId;
    this.tipo = props.tipo;
    this.label = props.label;
    this.fechaHora = props.fechaHora;
    this.ubicacionLat = props.ubicacionLat ?? null;
    this.ubicacionLng = props.ubicacionLng ?? null;
    this.createdAt = props.createdAt;
    this.nombreEmpleado = props.nombreEmpleado;
  }

  toJSON(): AsistenciaProps {
    return {
      id: this.id,
      empleadoId: this.empleadoId,
      tipo: this.tipo,
      label: this.label,
      fechaHora: this.fechaHora,
      ubicacionLat: this.ubicacionLat,
      ubicacionLng: this.ubicacionLng,
      createdAt: this.createdAt,
      nombreEmpleado: this.nombreEmpleado,
    };
  }
}

