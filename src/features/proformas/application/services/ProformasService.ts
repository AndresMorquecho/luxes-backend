import { PrismaProformasPersistence, ProformaInput } from '../../infrastructure/adapters/persistence/prismaProformasPersistence.js';

export class ProformasService {
  constructor(private readonly persistence = new PrismaProformasPersistence()) {}

  listProformas() {
    return this.persistence.listProformas();
  }

  saveProforma(input: ProformaInput) {
    if (!input.cliente?.trim()) {
      throw new Error('El nombre del cliente es obligatorio');
    }
    return this.persistence.saveProforma(input);
  }

  updateProformaEstado(id: string, estado: string) {
    const allowed = ['Pendiente', 'Aprobada', 'Rechazada', 'Pagada'];
    if (!allowed.includes(estado)) {
      throw new Error('Estado de proforma inválido');
    }
    return this.persistence.updateProformaEstado(id, estado);
  }

  deleteProforma(id: string) {
    return this.persistence.deleteProforma(id);
  }
}
