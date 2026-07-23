export class Empleado {
    id;
    nombre;
    cedula;
    telefono;
    correo;
    cuentaBanco;
    banco;
    tipoContrato;
    tieneContrato;
    region;
    decimoTerceroMensualizado;
    decimoCuartoMensualizado;
    sueldoDiario;
    decimoTerceroValor;
    decimoCuartoValor;
    iessValor;
    direccion;
    foto;
    rol;
    constructor(props) {
        this.id = props.id;
        this.nombre = props.nombre;
        this.cedula = props.cedula;
        this.telefono = props.telefono;
        this.correo = props.correo;
        this.cuentaBanco = props.cuentaBanco;
        this.banco = props.banco;
        this.tipoContrato = props.tipoContrato;
        this.tieneContrato = props.tieneContrato;
        this.region = props.region ?? 'costa';
        this.decimoTerceroMensualizado = props.decimoTerceroMensualizado ?? false;
        this.decimoCuartoMensualizado = props.decimoCuartoMensualizado ?? false;
        this.sueldoDiario = props.sueldoDiario;
        this.decimoTerceroValor = props.decimoTerceroValor !== undefined ? props.decimoTerceroValor : null;
        this.decimoCuartoValor = props.decimoCuartoValor !== undefined ? props.decimoCuartoValor : null;
        this.iessValor = props.iessValor !== undefined ? props.iessValor : null;
        this.direccion = props.direccion;
        this.foto = props.foto ?? null;
        this.rol = props.rol;
    }
    toJSON() {
        return {
            id: this.id,
            nombre: this.nombre,
            cedula: this.cedula,
            telefono: this.telefono,
            correo: this.correo,
            cuentaBanco: this.cuentaBanco,
            banco: this.banco,
            tipoContrato: this.tipoContrato,
            tieneContrato: this.tieneContrato,
            region: this.region,
            decimoTerceroMensualizado: this.decimoTerceroMensualizado,
            decimoCuartoMensualizado: this.decimoCuartoMensualizado,
            sueldoDiario: this.sueldoDiario,
            decimoTerceroValor: this.decimoTerceroValor,
            decimoCuartoValor: this.decimoCuartoValor,
            iessValor: this.iessValor,
            direccion: this.direccion,
            foto: this.foto ?? '',
            rol: this.rol,
        };
    }
}
