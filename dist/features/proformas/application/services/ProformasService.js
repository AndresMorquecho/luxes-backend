import { PrismaProformasPersistence } from '../../infrastructure/adapters/persistence/prismaProformasPersistence.js';
export class ProformasService {
    persistence;
    constructor(persistence = new PrismaProformasPersistence()) {
        this.persistence = persistence;
    }
    listProformas() {
        return this.persistence.listProformas();
    }
    saveProforma(input) {
        if (!input.cliente?.trim()) {
            throw new Error('El nombre del cliente es obligatorio');
        }
        return this.persistence.saveProforma(input);
    }
    updateProformaEstado(id, estado) {
        const allowed = ['Pendiente', 'Aprobada', 'Rechazada', 'Pagada'];
        if (!allowed.includes(estado)) {
            throw new Error('Estado de proforma inválido');
        }
        return this.persistence.updateProformaEstado(id, estado);
    }
    deleteProforma(id) {
        return this.persistence.deleteProforma(id);
    }
}
