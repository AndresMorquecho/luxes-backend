import { loginUser } from '../../domain/use-cases/loginUser.js';

/**
 * Servicio de aplicación: orquesta casos de uso e inyecta puertos.
 */
export class AuthService {
  constructor({ userRepository, passwordHasher, tokenService }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
  }

  async login({ username, password }) {
    return loginUser(
      { username, password },
      {
        userRepository: this.userRepository,
        passwordHasher: this.passwordHasher,
        tokenService: this.tokenService,
      },
    );
  }
}
