import { User } from '../entities/User.js';
import { ValidationError, UserAlreadyExistsError } from '../errors/AuthErrors.js';
/** Mapea nombre de rol del UI a slug almacenado en users.rol */
function normalizeRol(rol) {
    if (!rol?.trim())
        return 'visor';
    const r = rol.trim().toLowerCase();
    const aliases = {
        administrador: 'admin',
        'ventas / diseñador': 'ventas',
        'ventas / disenador': 'ventas',
        diseñador: 'disenador',
        impresión: 'impresion',
        'servicio al cliente': 'visor',
        user: 'visor',
        editor: 'visor',
    };
    return aliases[r] || r;
}
/**
 * Caso de uso: Registrar un nuevo usuario.
 * Aplica lógica de negocio de dominio para validar campos, contraseñas y unicidad.
 */
export async function registerUser({ nombre, email, username, password, rol }, { userRepository, passwordHasher }) {
    if (!nombre?.trim())
        throw new ValidationError('El nombre es requerido');
    if (!email?.trim())
        throw new ValidationError('El correo electrónico es requerido');
    if (!username?.trim())
        throw new ValidationError('El nombre de usuario es requerido');
    if (!password || password.length < 6) {
        throw new ValidationError('La contraseña es requerida y debe tener al menos 6 caracteres');
    }
    const parsedRol = normalizeRol(rol);
    // Verificar si ya existe por email o username
    const existingUser = await userRepository.findByUsernameOrEmail(email);
    if (existingUser) {
        throw new UserAlreadyExistsError('El correo electrónico ya está registrado');
    }
    const existingUsername = await userRepository.findByUsernameOrEmail(username);
    if (existingUsername) {
        throw new UserAlreadyExistsError('El nombre de usuario ya está registrado');
    }
    // Hashear contraseña
    const passwordHash = await passwordHasher.hash(password);
    // Generar ID de usuario amigable
    const id = `USR-${globalThis.crypto.randomUUID().split('-')[0].toUpperCase()}`;
    const user = new User({
        id,
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        rol: parsedRol,
        estado: 'activo',
        passwordHash,
        fechaCreacion: new Date().toISOString().split('T')[0],
    });
    return userRepository.create(user);
}
