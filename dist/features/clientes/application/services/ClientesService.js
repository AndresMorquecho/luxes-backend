import { PrismaClientesPersistence, } from '../../infrastructure/adapters/persistence/prismaClientesPersistence.js';
export class ClientesService {
    persistence;
    constructor(persistence = new PrismaClientesPersistence()) {
        this.persistence = persistence;
    }
    listClientes() {
        return this.persistence.list();
    }
    saveCliente(input) {
        if (!input.nombre?.trim()) {
            throw new Error('El nombre del cliente es obligatorio');
        }
        return this.persistence.save(input);
    }
    deleteCliente(id) {
        return this.persistence.remove(id);
    }
}
