/**
 * Puerto de persistencia de usuarios.
 * La infraestructura debe implementar estos métodos.
 */
export class UserRepositoryPort {
  async findByUsernameOrEmail(identifier) {
    throw new Error('UserRepositoryPort.findByUsernameOrEmail() no implementado');
  }

  async findById(id) {
    throw new Error('UserRepositoryPort.findById() no implementado');
  }
}
