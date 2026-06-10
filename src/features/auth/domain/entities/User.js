/**
 * Entidad de dominio: Usuario autenticable.
 */
export class User {
  constructor({
    id,
    nombre,
    email,
    username,
    rol,
    estado,
    passwordHash,
    fechaCreacion,
  }) {
    this.id = id;
    this.nombre = nombre;
    this.email = email;
    this.username = username;
    this.rol = rol;
    this.estado = estado;
    this.passwordHash = passwordHash;
    this.fechaCreacion = fechaCreacion;
  }

  isActive() {
    return this.estado === 'activo';
  }

  toPublic() {
    return {
      id: this.id,
      nombre: this.nombre,
      email: this.email,
      username: this.username,
      rol: this.rol,
      estado: this.estado,
      fechaCreacion: this.fechaCreacion,
    };
  }
}
