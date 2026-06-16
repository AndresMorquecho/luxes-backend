import { EmpleadoInput, EmpleadoRepositoryPort } from '../../domain/ports/EmpleadoRepositoryPort.js';
import { Empleado } from '../../domain/entities/Empleado.js';
import { EmpleadoDocumento } from '../../domain/entities/EmpleadoDocumento.js';
import { PrismaEmpleadoDocumentoAdapter } from '../../infrastructure/adapters/persistence/prismaEmpleadoDocumentoAdapter.js';
import { EmpleadoDocumentoTipo } from '../../domain/entities/EmpleadoDocumento.js';
import { BcryptPasswordAdapter } from '../../../auth/infrastructure/adapters/security/bcryptPasswordAdapter.js';
import { prisma } from '../../../../config/prismaClient.js';

const DEFAULT_PASSWORD = '123456';

export class EmpleadoService {
  constructor(
    private readonly empleadoRepository: EmpleadoRepositoryPort,
    private readonly documentoRepository = new PrismaEmpleadoDocumentoAdapter(),
    private readonly passwordHasher = new BcryptPasswordAdapter(),
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

    // Validar si el correo ya está registrado en User
    if (data.correo?.trim()) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: data.correo.trim().toLowerCase() }
      });
      if (existingEmail) {
        throw new Error('Ya existe un usuario con ese correo electrónico');
      }
    }

    // Validar si el username ya está registrado en User
    const username = data.username?.trim() || data.correo?.trim().split('@')[0] || `user_${data.cedula.trim()}`;
    const existingUsername = await prisma.user.findFirst({
      where: { username }
    });
    if (existingUsername) {
      throw new Error('Ya existe un usuario con ese nombre de usuario');
    }

    const id = await this.empleadoRepository.generateNextId();
    const passwordHash = await this.passwordHasher.hash(data.contraseña?.trim() || DEFAULT_PASSWORD);
    
    const empleado = await this.empleadoRepository.create(id, { ...data, passwordHash });

    // Crear el usuario correspondiente de manera automática
    if (data.correo?.trim()) {
      const defaultRole = await prisma.role.findFirst({
        where: { name: { in: ['User', 'Colaborador', 'visor'], mode: 'insensitive' } }
      });

      await prisma.user.create({
        data: {
          nombre: data.nombre,
          email: data.correo.trim().toLowerCase(),
          username,
          passwordHash: await this.passwordHasher.hash('123456'),
          rol: defaultRole?.name || 'visor',
          roleId: defaultRole?.id || null,
          estado: 'activo'
        }
      });
    }

    return empleado;
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

    const updateData: EmpleadoInput = { ...data };
    if (data.contraseña?.trim()) {
      updateData.passwordHash = await this.passwordHasher.hash(data.contraseña.trim());
    }

    return this.empleadoRepository.update(id, updateData);
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
