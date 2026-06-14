import { Credentials } from '../value-objects/Credentials.js';
import {
  InactiveUserError,
  InvalidCredentialsError,
  ValidationError,
} from '../errors/AuthErrors.js';
import { UserRepositoryPort } from '../ports/UserRepositoryPort.js';
import { PasswordHasherPort } from '../ports/PasswordHasherPort.js';
import { TokenServicePort } from '../ports/TokenServicePort.js';

interface LoginInput {
  username?: string;
  password?: string;
}

interface LoginDependencies {
  userRepository: UserRepositoryPort;
  passwordHasher: PasswordHasherPort;
  tokenService: TokenServicePort;
}

/**
 * Caso de uso: autenticar usuario con credenciales.
 * Lógica pura de dominio — sin dependencias de framework.
 */
export async function loginUser(
  { username, password }: LoginInput,
  { userRepository, passwordHasher, tokenService }: LoginDependencies,
) {

  const credentials = new Credentials(username, password);

  if (!credentials.isValid()) {
    throw new ValidationError('Usuario y contraseña son requeridos');
  }

  const user = await userRepository.findByUsername(credentials.username);

  if (!user) {
    throw new InvalidCredentialsError();
  }

  if (!user.isActive()) {
    throw new InactiveUserError();
  }

  const passwordMatches = await passwordHasher.compare(
    credentials.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  const token = await tokenService.sign({
    sub: user.id,
    rol: user.rol,
    email: user.email,
    permissions: user.permissions || [],
  });

  return {
    token,
    user: user.toPublic(),
  };
}
