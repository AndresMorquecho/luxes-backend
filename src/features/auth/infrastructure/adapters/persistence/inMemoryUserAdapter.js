import { User } from '../../../domain/entities/User.js';
import { UserRepositoryPort } from '../../../domain/ports/UserRepositoryPort.js';

/**
 * Adaptador en memoria con usuarios de desarrollo.
 * Sustituible por Prisma/PostgreSQL sin cambiar el dominio.
 */
export class InMemoryUserAdapter extends UserRepositoryPort {
  constructor(users = []) {
    super();
    this.users = users;
  }

  async findByUsernameOrEmail(identifier) {
    const normalized = identifier.toLowerCase();
    const found = this.users.find(
      (user) =>
        user.username.toLowerCase() === normalized ||
        user.email.toLowerCase() === normalized,
    );
    return found ?? null;
  }

  async findById(id) {
    const found = this.users.find((user) => user.id === id);
    return found ?? null;
  }
}

/**
 * Crea el repositorio con usuarios seed y contraseñas hasheadas.
 * Contraseña por defecto en desarrollo: luxes2026
 */
export async function createInMemoryUserRepository(passwordHasher) {
  const defaultPasswordHash = await passwordHasher.hash('luxes2026');

  const seedData = [
    {
      id: 'USR-001',
      nombre: 'Admin Principal',
      email: 'admin@luxes.com',
      username: 'admin',
      rol: 'admin',
      estado: 'activo',
      fechaCreacion: '2025-01-15',
    },
    {
      id: 'USR-002',
      nombre: 'María Fernanda Torres',
      email: 'maria.torres@luxes.com',
      username: 'maria.torres',
      rol: 'editor',
      estado: 'activo',
      fechaCreacion: '2025-02-20',
    },
    {
      id: 'USR-003',
      nombre: 'Carlos Mendoza',
      email: 'carlos.mendoza@luxes.com',
      username: 'carlos.mendoza',
      rol: 'visor',
      estado: 'activo',
      fechaCreacion: '2025-03-10',
    },
  ];

  const users = seedData.map(
    (data) =>
      new User({
        ...data,
        passwordHash: defaultPasswordHash,
      }),
  );

  return new InMemoryUserAdapter(users);
}
