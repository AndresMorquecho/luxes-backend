import jwt from 'jsonwebtoken';
import { TokenServicePort } from '../../../domain/ports/TokenServicePort.js';

/**
 * Adaptador de infraestructura: JWT para tokens de sesión.
 */
export class JwtTokenAdapter extends TokenServicePort {
  constructor({ secret, expiresIn }) {
    super();
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  sign(payload) {
    return Promise.resolve(
      jwt.sign(payload, this.secret, { expiresIn: this.expiresIn }),
    );
  }

  verify(token) {
    return Promise.resolve(jwt.verify(token, this.secret));
  }
}
