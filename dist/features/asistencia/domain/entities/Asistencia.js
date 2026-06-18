export class Asistencia {
    id;
    empleadoId;
    tipo;
    label;
    fechaHora;
    ubicacionLat;
    ubicacionLng;
    createdAt;
    nombreEmpleado;
    constructor(props) {
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
    toJSON() {
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
