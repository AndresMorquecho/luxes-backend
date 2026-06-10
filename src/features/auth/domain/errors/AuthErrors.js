export class AuthError extends Error {
  constructor(message, code = 'AUTH_ERROR', statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Credenciales inválidas', 'INVALID_CREDENTIALS', 401);
  }
}

export class InactiveUserError extends AuthError {
  constructor() {
    super('Usuario inactivo', 'INACTIVE_USER', 403);
  }
}

export class ValidationError extends AuthError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}
