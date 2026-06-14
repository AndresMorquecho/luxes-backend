import {
  GastoInput,
  MantenimientoInput,
  PrismaGastosPersistence,
  VehiculoInput,
} from '../../infrastructure/adapters/persistence/prismaGastosPersistence.js';

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
  constructor(private readonly persistence = new PrismaGastosPersistence()) {}

  listGastos() {
    return this.persistence.listGastos();
  }

  saveGasto(input: GastoInput) {
    if (!input.concepto?.trim()) throw new Error('El concepto es obligatorio');
    if (!input.monto || input.monto <= 0) throw new Error('El monto debe ser mayor a cero');
    return this.persistence.saveGasto(input);
  }

  deleteGasto(id: string) {
    return this.persistence.deleteGasto(id);
  }

  listVehiculos() {
    return this.persistence.listVehiculos();
  }

  saveVehiculo(input: VehiculoInput) {
    if (!input.placa?.trim()) throw new Error('La placa es obligatoria');
    return this.persistence.saveVehiculo(input);
  }

  deleteVehiculo(id: string) {
    return this.persistence.deleteVehiculo(id);
  }

  listMantenimientos(vehiculoId: string) {
    return this.persistence.listMantenimientos(vehiculoId);
  }

  saveMantenimiento(input: MantenimientoInput) {
    if (!input.tipo?.trim()) throw new Error('El tipo de mantenimiento es obligatorio');
    if (!TIPOS_MANTENIMIENTO.includes(input.tipo)) {
      throw new Error('Tipo de mantenimiento inválido');
    }
    return this.persistence.saveMantenimiento(input);
  }

  deleteMantenimiento(id: string) {
    return this.persistence.deleteMantenimiento(id);
  }
}

export { TIPOS_MANTENIMIENTO };
