import {
  ClienteInput,
  PrismaClientesPersistence,
} from '../../infrastructure/adapters/persistence/prismaClientesPersistence.js';

export class ClientesService {
  constructor(private readonly persistence = new PrismaClientesPersistence()) {}

  listClientes() {
    return this.persistence.list();
  }

  saveCliente(input: ClienteInput) {
    if (!input.nombre?.trim()) {
      throw new Error('El nombre del cliente es obligatorio');
    }
    return this.persistence.save(input);
  }

  deleteCliente(id: string) {
    return this.persistence.remove(id);
  }
}
