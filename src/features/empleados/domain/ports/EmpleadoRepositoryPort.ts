import { Empleado } from '../entities/Empleado.js';

export type EmpleadoInput = {
  nombre: string;
  cedula: string;
  cargo?: string;
  departamento?: string;
  telefono?: string;
  correo?: string;
  username?: string;
  contraseña?: string;
  passwordHash?: string;
  cuentaBanco?: string;
  banco?: string;
  tipoContrato?: string;
  tieneContrato?: boolean;
  region?: string;
  decimoTerceroMensualizado?: boolean;
  decimoCuartoMensualizado?: boolean;
  sueldoDiario?: number;
  direccion?: string;
  foto?: string | null;
  rol?: string;
  roleId?: string;
};

export abstract class EmpleadoRepositoryPort {
  abstract findAll(): Promise<Empleado[]>;
  abstract findById(id: string): Promise<Empleado | null>;
  abstract findByCedula(cedula: string): Promise<Empleado | null>;
  abstract create(id: string, data: EmpleadoInput): Promise<Empleado>;
  abstract update(id: string, data: EmpleadoInput): Promise<Empleado>;
  abstract delete(id: string): Promise<void>;
  abstract generateNextId(): Promise<string>;
}
