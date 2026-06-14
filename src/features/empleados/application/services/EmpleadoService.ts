import { EmpleadoInput, EmpleadoRepositoryPort } from '../../domain/ports/EmpleadoRepositoryPort.js';
import { Empleado } from '../../domain/entities/Empleado.js';
import { EmpleadoDocumento } from '../../domain/entities/EmpleadoDocumento.js';
import { PrismaEmpleadoDocumentoAdapter } from '../../infrastructure/adapters/persistence/prismaEmpleadoDocumentoAdapter.js';
import { EmpleadoDocumentoTipo } from '../../domain/entities/EmpleadoDocumento.js';

export class EmpleadoService {
  constructor(
    private readonly empleadoRepository: EmpleadoRepositoryPort,
    private readonly documentoRepository = new PrismaEmpleadoDocumentoAdapter()
  ) {}

  listEmpleados(): Promise<Empleado[]> {
    return this.empleadoRepository.findAll();
  }

  getEmpleadoById(id: string): Promise<Empleado | null> {
    return this.empleadoRepository.findById(id);
  }

  async createEmpleado(data: EmpleadoInput): Promise<Empleado> {
    this.validateInput(data);

    const existing = await this.empleadoRepository.findByCedula(data.cedula.trim());
    if (existing) {
      throw new Error('Ya existe un empleado con esa cédula');
    }

    const id = await this.empleadoRepository.generateNextId();
    return this.empleadoRepository.create(id, data);
  }

  async updateEmpleado(id: string, data: EmpleadoInput): Promise<Empleado> {
    this.validateInput(data);

    const current = await this.empleadoRepository.findById(id);
    if (!current) {
      throw new Error('Empleado no encontrado');
    }

    const duplicate = await this.empleadoRepository.findByCedula(data.cedula.trim());
    if (duplicate && duplicate.id !== id) {
      throw new Error('Ya existe otro empleado con esa cédula');
    }

    return this.empleadoRepository.update(id, data);
  }

  async deleteEmpleado(id: string): Promise<void> {
    const current = await this.empleadoRepository.findById(id);
    if (!current) {
      throw new Error('Empleado no encontrado');
    }

    await this.documentoRepository.deleteAllForEmpleado(id);
    await this.empleadoRepository.delete(id);
  }

  listDocumentos(empleadoId: string): Promise<EmpleadoDocumento[]> {
    return this.documentoRepository.listByEmpleado(empleadoId);
  }

  async addDocumento(input: {
    empleadoId: string;
    tipo: EmpleadoDocumentoTipo;
    nombre: string;
    archivoUrl: string;
    mimeType: string;
    tamano: number;
  }): Promise<EmpleadoDocumento> {
    const empleado = await this.empleadoRepository.findById(input.empleadoId);
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }

    return this.documentoRepository.create(input);
  }

  deleteDocumento(empleadoId: string, documentoId: string): Promise<void> {
    return this.documentoRepository.delete(empleadoId, documentoId);
  }

  private validateInput(data: EmpleadoInput): void {
    if (!data.nombre?.trim()) {
      throw new Error('El nombre es obligatorio');
    }
    if (!data.cedula?.trim()) {
      throw new Error('La cédula es obligatoria');
    }
    if (!/^\d{10}$/.test(data.cedula.trim())) {
      throw new Error('La cédula debe tener 10 dígitos');
    }
  }
}
