/**
 * Puerto para emisión y verificación de tokens JWT.
 */
export class TokenServicePort {
  async sign(payload) {
    throw new Error('TokenServicePort.sign() no implementado');
  }

  async verify(token) {
    throw new Error('TokenServicePort.verify() no implementado');
  }
}
