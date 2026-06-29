import { PrismaNominaPersistence } from '../../infrastructure/adapters/persistence/prismaNominaPersistence.js';
export class NominaService {
    persistence;
    constructor(persistence = new PrismaNominaPersistence()) {
        this.persistence = persistence;
    }
    listAsistencias(filters) {
        return this.persistence.listAsistencias(filters);
    }
    getProximaMarcacion(empleadoId) {
        return this.persistence.getProximaMarcacion(empleadoId);
    }
    registrarAsistencia(input) {
        return this.persistence.registrarAsistencia(input);
    }
    listVacaciones(anio) {
        return this.persistence.listVacaciones(anio);
    }
    upsertVacacion(input) {
        return this.persistence.upsertVacacion(input);
    }
    listHorasExtras(fechaInicio, fechaFin) {
        return this.persistence.listHorasExtras(fechaInicio, fechaFin);
    }
    saveHorasExtrasBulk(fechaInicio, fechaFin, records) {
        return this.persistence.saveHorasExtrasBulk(fechaInicio, fechaFin, records);
    }
    listNominas(fechaInicio, fechaFin) {
        return this.persistence.listNominas(fechaInicio, fechaFin);
    }
    saveNomina(input) {
        return this.persistence.saveNomina(input);
    }
}
