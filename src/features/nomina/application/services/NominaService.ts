import { PrismaNominaPersistence } from '../../infrastructure/adapters/persistence/prismaNominaPersistence.js';

export class NominaService {
  constructor(private readonly persistence = new PrismaNominaPersistence()) {}

  listAsistencias(filters: { fechaInicio?: string; fechaFin?: string; empleadoId?: string }) {
    return this.persistence.listAsistencias(filters);
  }

  getProximaMarcacion(empleadoId: string) {
    return this.persistence.getProximaMarcacion(empleadoId);
  }

  registrarAsistencia(input: { empleadoId: string; ubicacion?: { lat?: number; lng?: number } | null }) {
    return this.persistence.registrarAsistencia(input);
  }

  listVacaciones(anio: number) {
    return this.persistence.listVacaciones(anio);
  }

  upsertVacacion(input: { empleadoId: string; anio: number; diasTomados: string[] }) {
    return this.persistence.upsertVacacion(input);
  }

  listHorasExtras(fechaInicio: string, fechaFin: string) {
    return this.persistence.listHorasExtras(fechaInicio, fechaFin);
  }

  saveHorasExtrasBulk(
    fechaInicio: string,
    fechaFin: string,
    records: Array<{
      id?: string;
      fecha: string;
      colaboradorId: string;
      horas: number;
      detalleHorario?: string;
      descripcion?: string;
      valorPorHora?: number;
      total?: number;
    }>
  ) {
    return this.persistence.saveHorasExtrasBulk(fechaInicio, fechaFin, records);
  }

  listNominas(fechaInicio: string, fechaFin: string) {
    return this.persistence.listNominas(fechaInicio, fechaFin);
  }

  saveNomina(input: {
    empleadoId: string;
    fechaInicio: string;
    fechaFin: string;
    diasLaborables?: number;
    diasLaborados?: number;
    permisoHoras?: number;
    ingresos?: Record<string, number>;
    egresos?: Record<string, number>;
    abonos?: Array<{ monto: number; fecha: string }>;
    estado?: string;
  }) {
    return this.persistence.saveNomina(input);
  }
}
