export interface EmpleadoProps {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  departamento: string;
  telefono: string;
  correo: string;
  cuentaBanco: string;
  banco: string;
  tipoContrato: string;
  tieneContrato: boolean;
  sueldoDiario: number;
  direccion: string;
  foto?: string | null;
}

export class Empleado {
  readonly id: string;
  readonly nombre: string;
  readonly cedula: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly telefono: string;
  readonly correo: string;
  readonly cuentaBanco: string;
  readonly banco: string;
  readonly tipoContrato: string;
  readonly tieneContrato: boolean;
  readonly sueldoDiario: number;
  readonly direccion: string;
  readonly foto: string | null;

  constructor(props: EmpleadoProps) {
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
    this.tieneContrato = props.tieneContrato;
    this.sueldoDiario = props.sueldoDiario;
    this.direccion = props.direccion;
    this.foto = props.foto ?? null;
  }

  toJSON(): EmpleadoProps {
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
      tieneContrato: this.tieneContrato,
      sueldoDiario: this.sueldoDiario,
      direccion: this.direccion,
      foto: this.foto ?? '',
    };
  }
}
