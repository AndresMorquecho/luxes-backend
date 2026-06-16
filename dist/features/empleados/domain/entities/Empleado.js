export class Empleado {
    id;
    nombre;
    cedula;
    cargo;
    departamento;
    telefono;
    correo;
    cuentaBanco;
    banco;
    tipoContrato;
    sueldoDiario;
    direccion;
    foto;
    constructor(props) {
        this.id = props.id;
        this.nombre = props.nombre;
        this.cedula = props.cedula;
        this.cargo = props.cargo;
        this.departamento = props.departamento;
        this.telefono = props.telefono;
        this.correo = props.correo;
        this.cuentaBanco = props.cuentaBanco;
        this.banco = props.banco;
        this.tipoContrato = props.tipoContrato;
        this.sueldoDiario = props.sueldoDiario;
        this.direccion = props.direccion;
        this.foto = props.foto ?? null;
    }
    toJSON() {
        return {
            id: this.id,
            nombre: this.nombre,
            cedula: this.cedula,
            cargo: this.cargo,
            departamento: this.departamento,
            telefono: this.telefono,
            correo: this.correo,
            cuentaBanco: this.cuentaBanco,
            banco: this.banco,
            tipoContrato: this.tipoContrato,
            sueldoDiario: this.sueldoDiario,
            direccion: this.direccion,
            foto: this.foto ?? '',
        };
    }
}
