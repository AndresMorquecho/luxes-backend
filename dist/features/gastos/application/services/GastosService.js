import { PrismaGastosPersistence, } from '../../infrastructure/adapters/persistence/prismaGastosPersistence.js';
const TIPOS_MANTENIMIENTO = [
    'cambio_aceite',
    'filtro_aceite',
    'filtro_aire',
    'llantas',
    'frenos',
    'bateria',
    'alineacion',
    'soat',
    'matricula',
    'revision_tecnica',
    'lavado',
    'combustible',
    'otro',
];
export class GastosService {
    persistence;
    constructor(persistence = new PrismaGastosPersistence()) {
        this.persistence = persistence;
    }
    listGastos() {
        return this.persistence.listGastos();
    }
    saveGasto(input) {
        if (!input.concepto?.trim())
            throw new Error('El concepto es obligatorio');
        if (!input.monto || input.monto <= 0)
            throw new Error('El monto debe ser mayor a cero');
        return this.persistence.saveGasto(input);
    }
    deleteGasto(id) {
        return this.persistence.deleteGasto(id);
    }
    listVehiculos() {
        return this.persistence.listVehiculos();
    }
    saveVehiculo(input) {
        if (!input.placa?.trim())
            throw new Error('La placa es obligatoria');
        return this.persistence.saveVehiculo(input);
    }
    deleteVehiculo(id) {
        return this.persistence.deleteVehiculo(id);
    }
    listMantenimientos(vehiculoId) {
        return this.persistence.listMantenimientos(vehiculoId);
    }
    saveMantenimiento(input) {
        if (!input.tipo?.trim())
            throw new Error('El tipo de mantenimiento es obligatorio');
        if (!TIPOS_MANTENIMIENTO.includes(input.tipo)) {
            throw new Error('Tipo de mantenimiento inválido');
        }
        return this.persistence.saveMantenimiento(input);
    }
    deleteMantenimiento(id) {
        return this.persistence.deleteMantenimiento(id);
    }
}
export { TIPOS_MANTENIMIENTO };
