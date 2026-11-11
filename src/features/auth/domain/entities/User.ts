/**
 * Entidad de dominio: Usuario autenticable.
 */
export class User {
  id: string;
  nombre: string;
  email: string;
  username: string;
  rol: string;
  roleId: string | null;
  estado: string;
  archivedAt: string | null;
  passwordHash: string;
  fechaCreacion: string;
  ultimoAcceso: string | null;
  permissions?: string[];
  sidebarConfig?: string | null;
  empleadoId?: string | null;
  foto?: string | null;

  constructor({
    id,
    nombre,
    email,
    username,
    rol,
    roleId = null,
    estado,
    archivedAt = null,
    passwordHash,
    fechaCreacion,
    ultimoAcceso = null,
    permissions = [],
    sidebarConfig = null,
    empleadoId = null,
    foto = null,
  }: {
    id: string;
    nombre: string;
    email: string;
    username: string;
    rol: string;
    roleId?: string | null;
    estado: string;
    archivedAt?: string | null;
    passwordHash: string;
    fechaCreacion: string;
    ultimoAcceso?: string | null;
    permissions?: string[];
    sidebarConfig?: string | null;
    empleadoId?: string | null;
    foto?: string | null;
  }) {
    this.id = id;
    this.nombre = nombre;
    this.email = email;
    this.username = username;
    this.rol = rol;
    this.roleId = roleId;
    this.estado = estado;
    this.archivedAt = archivedAt;
    this.passwordHash = passwordHash;
    this.fechaCreacion = fechaCreacion;
    this.ultimoAcceso = ultimoAcceso;
    this.permissions = permissions;
    this.sidebarConfig = sidebarConfig;
    this.empleadoId = empleadoId;
    this.foto = foto;
  }

  isActive(): boolean {
    return this.estado === 'activo' && !this.archivedAt;
  }

  toPublic() {
    return {
      id: this.id,
      nombre: this.nombre,
      email: this.email,
      username: this.username,
      rol: this.rol,
      roleId: this.roleId,
      estado: this.estado,
      archivedAt: this.archivedAt,
      fechaCreacion: this.fechaCreacion,
      ultimoAcceso: this.ultimoAcceso,
      permissions: this.permissions || [],
      sidebarConfig: this.sidebarConfig,
      empleadoId: this.empleadoId,
      foto: this.foto,
    };
  }
}
