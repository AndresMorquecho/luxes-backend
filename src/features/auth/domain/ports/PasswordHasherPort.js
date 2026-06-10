/**
 * Puerto para verificación y hash de contraseñas.
 */
export class PasswordHasherPort {
  async compare(plainPassword, passwordHash) {
    throw new Error('PasswordHasherPort.compare() no implementado');
  }

  async hash(plainPassword) {
    throw new Error('PasswordHasherPort.hash() no implementado');
  }
}
