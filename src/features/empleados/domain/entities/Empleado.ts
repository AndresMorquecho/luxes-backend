export interface EmpleadoProps {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  cuentaBanco: string;
  banco: string;
  tipoContrato: string;
  tieneContrato: boolean;
  region: string;
  decimoTerceroMensualizado: boolean;
  decimoCuartoMensualizado: boolean;
  sueldoDiario: number;
  decimoTerceroValor?: number | null;
  decimoCuartoValor?: number | null;
  iessValor?: number | null;
  direccion: string;
  foto?: string | null;
  rol?: string;
}

export class Empleado {
  readonly id: string;
  readonly nombre: string;
  readonly cedula: string;
  readonly telefono: string;
  readonly correo: string;
  readonly cuentaBanco: string;
  readonly banco: string;
  readonly tipoContrato: string;
  readonly tieneContrato: boolean;
  readonly region: string;
  readonly decimoTerceroMensualizado: boolean;
  readonly decimoCuartoMensualizado: boolean;
  readonly sueldoDiario: number;
  readonly decimoTerceroValor: number | null;
  readonly decimoCuartoValor: number | null;
  readonly iessValor: number | null;
  readonly direccion: string;
  readonly foto: string | null;
  readonly rol?: string;

  constructor(props: EmpleadoProps) {
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

  toJSON(): EmpleadoProps {
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
