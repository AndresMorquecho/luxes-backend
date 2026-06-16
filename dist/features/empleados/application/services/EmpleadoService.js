import { PrismaEmpleadoDocumentoAdapter } from '../../infrastructure/adapters/persistence/prismaEmpleadoDocumentoAdapter.js';
import { BcryptPasswordAdapter } from '../../../auth/infrastructure/adapters/security/bcryptPasswordAdapter.js';
import { prisma } from '../../../../config/prismaClient.js';
const DEFAULT_PASSWORD = '123456';
export class EmpleadoService {
    empleadoRepository;
    documentoRepository;
    passwordHasher;
    constructor(empleadoRepository, documentoRepository = new PrismaEmpleadoDocumentoAdapter(), passwordHasher = new BcryptPasswordAdapter()) {
        this.empleadoRepository = empleadoRepository;
        this.documentoRepository = documentoRepository;
        this.passwordHasher = passwordHasher;
    }
    listEmpleados() {
        return this.empleadoRepository.findAll();
    }
    getEmpleadoById(id) {
        return this.empleadoRepository.findById(id);
    }
    async createEmpleado(data) {
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
    async updateEmpleado(id, data) {
        this.validateInput(data);
        const current = await this.empleadoRepository.findById(id);
        if (!current) {
            throw new Error('Empleado no encontrado');
        }
        const duplicate = await this.empleadoRepository.findByCedula(data.cedula.trim());
        if (duplicate && duplicate.id !== id) {
            throw new Error('Ya existe otro empleado con esa cédula');
        }
        const updateData = { ...data };
        if (data.contraseña?.trim()) {
            updateData.passwordHash = await this.passwordHasher.hash(data.contraseña.trim());
        }
        return this.empleadoRepository.update(id, updateData);
    }
    async deleteEmpleado(id) {
        const current = await this.empleadoRepository.findById(id);
        if (!current) {
            throw new Error('Empleado no encontrado');
        }
        await this.documentoRepository.deleteAllForEmpleado(id);
        await this.empleadoRepository.delete(id);
    }
    listDocumentos(empleadoId) {
        return this.documentoRepository.listByEmpleado(empleadoId);
    }
    async addDocumento(input) {
        const empleado = await this.empleadoRepository.findById(input.empleadoId);
        if (!empleado) {
            throw new Error('Empleado no encontrado');
        }
        return this.documentoRepository.create(input);
    }
    deleteDocumento(empleadoId, documentoId) {
        return this.documentoRepository.delete(empleadoId, documentoId);
    }
    validateInput(data) {
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
