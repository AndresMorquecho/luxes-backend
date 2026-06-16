export const EMPLEADO_DOCUMENTO_TIPOS = [
    'cedula_frontal',
    'cedula_posterior',
    'contrato',
    'titulo',
    'certificado',
    'antecedentes',
    'curriculum',
    'planilla_luz',
    'otro',
];
export class EmpleadoDocumento {
    id;
    empleadoId;
    tipo;
    nombre;
    archivoUrl;
    mimeType;
    tamano;
    createdAt;
    constructor(props) {
        this.id = props.id;
        this.empleadoId = props.empleadoId;
        this.tipo = props.tipo;
        this.nombre = props.nombre;
        this.archivoUrl = props.archivoUrl;
        this.mimeType = props.mimeType;
        this.tamano = props.tamano;
        this.createdAt = props.createdAt;
    }
    toJSON() {
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
