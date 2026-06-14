export const EMPLEADO_DOCUMENTO_TIPOS = [
  'cedula_frontal',
  'cedula_posterior',
  'contrato',
  'titulo',
  'certificado',
  'antecedentes',
  'curriculum',
  'otro',
] as const;

export type EmpleadoDocumentoTipo = (typeof EMPLEADO_DOCUMENTO_TIPOS)[number];

export interface EmpleadoDocumentoProps {
  id: string;
  empleadoId: string;
  tipo: EmpleadoDocumentoTipo;
  nombre: string;
  archivoUrl: string;
  mimeType: string;
  tamano: number;
  createdAt: string;
}

export class EmpleadoDocumento {
  readonly id: string;
  readonly empleadoId: string;
  readonly tipo: EmpleadoDocumentoTipo;
  readonly nombre: string;
  readonly archivoUrl: string;
  readonly mimeType: string;
  readonly tamano: number;
  readonly createdAt: string;

  constructor(props: EmpleadoDocumentoProps) {
    this.id = props.id;
    this.empleadoId = props.empleadoId;
    this.tipo = props.tipo;
    this.nombre = props.nombre;
    this.archivoUrl = props.archivoUrl;
    this.mimeType = props.mimeType;
    this.tamano = props.tamano;
    this.createdAt = props.createdAt;
  }

  toJSON(): EmpleadoDocumentoProps {
    return {
      id: this.id,
      empleadoId: this.empleadoId,
      tipo: this.tipo,
      nombre: this.nombre,
      archivoUrl: this.archivoUrl,
      mimeType: this.mimeType,
      tamano: this.tamano,
      createdAt: this.createdAt,
    };
  }
}
