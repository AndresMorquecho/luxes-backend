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

    const username = data.username?.trim() || data.correo?.trim().split('@')[0] || `user_${data.cedula.trim()}`;
    const email = data.correo?.trim().toLowerCase() || `${username}@luxes.com`;

    // Validar si el correo ya está registrado en User
    const existingEmail = await prisma.user.findFirst({
      where: { email }
    });
    if (existingEmail) {
      throw new Error('Ya existe un usuario con ese correo electrónico');
    }

    // Validar si el username ya está registrado en User
    const existingUsername = await prisma.user.findFirst({
      where: { username }
    });
    if (existingUsername) {
      throw new Error('Ya existe un usuario con ese nombre de usuario');
    }

    const id = await this.empleadoRepository.generateNextId();
    const passwordHash = await this.passwordHasher.hash(data.contraseña?.trim() || DEFAULT_PASSWORD);
    
    const empleado = await this.empleadoRepository.create(id, { ...data, correo: email, passwordHash });

    // Crear el usuario correspondiente de manera automática y vincularlo
    const defaultRole = data.roleId 
      ? await prisma.role.findUnique({ where: { id: data.roleId } })
      : await prisma.role.findFirst({
          where: { name: { in: ['User', 'Colaborador', 'visor'], mode: 'insensitive' } }
        });

    await prisma.user.create({
      data: {
        nombre: data.nombre,
        email,
        username,
        passwordHash,
        rol: defaultRole?.name || data.rol || 'visor',
        roleId: defaultRole?.id || null,
        estado: 'activo',
        empleadoId: empleado.id
      }
    });

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

    const empleado = await this.empleadoRepository.update(id, updateData);

    // Sincronizar con User
    const email = data.correo?.trim().toLowerCase();
    const username = data.username?.trim();

    const user = await prisma.user.findUnique({ where: { empleadoId: id } });
    if (user) {
      if (email && email !== user.email) {
        const existingEmail = await prisma.user.findFirst({ where: { email } });
        if (existingEmail) {
          throw new Error('Ya existe un usuario con ese correo electrónico');
        }
      }
      if (username && username !== user.username) {
        const existingUsername = await prisma.user.findFirst({ where: { username } });
        if (existingUsername) {
          throw new Error('Ya existe un usuario con ese nombre de usuario');
        }
      }

      let userRol = user.rol;
      let userRoleId = user.roleId;

      if (data.roleId) {
        const selectedRole = await prisma.role.findUnique({ where: { id: data.roleId } });
        if (selectedRole) {
          userRol = selectedRole.name;
          userRoleId = selectedRole.id;
        }
      } else if (data.rol) {
        userRol = data.rol;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          nombre: data.nombre,
          email: email || user.email,
          username: username || user.username,
          rol: userRol,
          roleId: userRoleId,
          ...(data.contraseña?.trim() ? { passwordHash: updateData.passwordHash } : {})
        }
      });
    }

    return empleado;
  }

  async deleteEmpleado(id: string): Promise<void> {
    const current = await this.empleadoRepository.findById(id);
    if (!current) {
      throw new Error('Empleado no encontrado');
    }

    // Desvincular usuario antes de borrar el empleado: el FK users.empleado_id tiene
    // onDelete Cascade y el usuario puede tener órdenes de compra, tareas, etc.
    const linkedUser = await prisma.user.findUnique({ where: { empleadoId: id } });
    if (linkedUser) {
      await prisma.user.update({
        where: { id: linkedUser.id },
        data: {
          empleadoId: null,
          estado: 'inactivo',
        },
      });
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
