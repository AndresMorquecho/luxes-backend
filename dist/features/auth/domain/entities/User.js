/**
 * Entidad de dominio: Usuario autenticable.
 */
export class User {
    id;
    nombre;
    email;
    username;
    rol;
    roleId;
    estado;
    passwordHash;
    fechaCreacion;
    ultimoAcceso;
    permissions;
    sidebarConfig;
    empleadoId;
    constructor({ id, nombre, email, username, rol, roleId = null, estado, passwordHash, fechaCreacion, ultimoAcceso = null, permissions = [], sidebarConfig = null, empleadoId = null, }) {
        this.id = id;
        this.nombre = nombre;
        this.email = email;
        this.username = username;
        this.rol = rol;
        this.roleId = roleId;
        this.estado = estado;
        this.passwordHash = passwordHash;
        this.fechaCreacion = fechaCreacion;
        this.ultimoAcceso = ultimoAcceso;
        this.permissions = permissions;
        this.sidebarConfig = sidebarConfig;
        this.empleadoId = empleadoId;
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
            roleId: this.roleId,
            estado: this.estado,
            fechaCreacion: this.fechaCreacion,
            ultimoAcceso: this.ultimoAcceso,
            permissions: this.permissions || [],
            sidebarConfig: this.sidebarConfig,
            empleadoId: this.empleadoId,
        };
    }
}
