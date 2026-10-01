import type { RecepcionInput, AnulacionInput } from '../../domain/types/CompraLifecycle.js';
import type {
  ComprasRepositoryPort,
  OrdenCompraData,
  ProveedorData,
  MetodoPagoData,
  AbonoCompraData,
  CuentaPorPagarData,
  CreateCuentaPorPagarManualInput,
  DetalleCompraInput,
  DetalleCompraData,
} from '../../domain/ports/ComprasRepositoryPort.js';

export class ComprasService {
  constructor(private readonly repo: ComprasRepositoryPort) {}

  // ── Proveedores ────────────────────────────────────────────────────────────

  getProveedores(): Promise<ProveedorData[]> {
    return this.repo.findAllProveedores();
  }

  createProveedor(data: {
    nombre: string;
    ruc?: string | null;
    tipo?: string;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    contacto?: string | null;
    notas?: string | null;
  }): Promise<ProveedorData> {
    if (!data.nombre || !data.nombre.trim()) {
      throw new Error('El nombre del proveedor es requerido.');
    }
    return this.repo.createProveedor(data);
  }

  updateProveedor(id: string, data: {
    nombre?: string;
    ruc?: string | null;
    tipo?: string;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    contacto?: string | null;
    notas?: string | null;
    estado?: string;
  }): Promise<ProveedorData> {
    return this.repo.updateProveedor(id, data);
  }

  deleteProveedor(id: string): Promise<void> {
    return this.repo.deleteProveedor(id);
  }

  // ── Órdenes de Compra ──────────────────────────────────────────────────────

  getOrdenes(options?: {
    page?: number;
    limit?: number;
    search?: string;
    estado?: string;
    estados?: string[];
    estadoPago?: string;
    proveedorId?: string;
    creadorRol?: string;
    creadorId?: string;
    pendienteRecepcion?: boolean;
    proyectoId?: string;
  }): Promise<{ items: OrdenCompraData[]; total: number }> {
    return this.repo.findAllOrdenes(options);
  }

  getOrdenById(id: string): Promise<OrdenCompraData | null> {
    return this.repo.findOrdenById(id);
  }

  getOrdenDetalles(ordenId: string): Promise<DetalleCompraData[]> {
    return this.repo.findDetallesByOrdenId(ordenId);
  }

  restoreOrdenDetalles(ordenId: string, detalles: DetalleCompraInput[]): Promise<OrdenCompraData> {
    if (!detalles?.length) {
      throw new Error('Debe indicar al menos un detalle para restaurar.');
    }
    for (const d of detalles) {
      if (!d.descripcion?.trim()) throw new Error('Cada detalle debe tener descripción.');
      if (d.cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0.');
    }
    return this.repo.restoreDetallesIfEmpty(ordenId, detalles);
  }

  async createOrden(data: {
    proveedorId?: string;
    usuarioId: string;
    fecha?: Date;
    impuesto?: number;
    concepto?: string;
    notas?: string;
    detalles: DetalleCompraInput[];
    fechaVencimiento?: Date | null;
    proyectoId?: string | null;
  }): Promise<OrdenCompraData> {
    if (!data.detalles || data.detalles.length === 0) {
      throw new Error('La orden debe tener al menos un item de detalle.');
    }
    for (const d of data.detalles) {
      if (d.cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0.');
      if (d.precioUnitario < 0) throw new Error('El precio unitario no puede ser negativo.');
    }
    return this.repo.createOrden(data);
  }

  async updateOrden(id: string, data: {
    proveedorId?: string | null;
    fecha?: Date;
    impuesto?: number;
    estado?: string;
    concepto?: string;
    notas?: string;
    detalles?: DetalleCompraInput[];
    aprobadoPorId?: string;
    proyectoId?: string | null;
    abonoMonto?: number;
    metodoPagoId?: string;
    abonoReferencia?: string;
    registrarAbonoAjuste?: boolean;
    registradoPorUserId?: string | null;
    fechaRecepcion?: Date;
    notasRecepcion?: string;
    recibidoPorId?: string;
  }): Promise<OrdenCompraData> {
    const orden = await this.repo.findOrdenById(id);
    if (!orden) throw new Error('Orden de compra no encontrada.');
    if (orden.estado === 'anulada') throw new Error('Una orden anulada conserva su historial y no puede editarse.');
    if (data.estado === 'anulada') throw new Error('Usa el flujo de anulación con vista previa.');
    if (orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida') {
      throw new Error('No se puede modificar una orden que ya fue recibida o está en recepción parcial.');
    }
    const isApprovalTransition = data.estado === 'aprobada' || data.estado === 'rechazada';
    if (!isApprovalTransition && orden.estado !== 'aprobada') {
      throw new Error('Solo se pueden editar órdenes que ya fueron aprobadas.');
    }
    if (data.detalles && data.detalles.length === 0) {
      throw new Error('La orden debe conservar al menos un item.');
    }

    const esNuevaAprobacion =
      data.estado === 'aprobada' && orden.estado !== 'aprobada';
    const abonoMonto = (data.registrarAbonoAjuste === true || esNuevaAprobacion)
      ? (Number(data.abonoMonto) || 0)
      : 0;
    if (abonoMonto > 0) {
      if (!data.metodoPagoId) {
        throw new Error('Debe seleccionar un método de pago para registrar el abono del ajuste.');
      }

      let nuevoTotal = Number(orden.total) || 0;
      if (data.detalles?.length) {
        const subtotal = data.detalles.reduce(
          (sum, d) => sum + d.cantidad * (d.precioUnitario ?? 0),
          0,
        );
        const impuesto = data.impuesto !== undefined ? data.impuesto : (Number(orden.impuesto) || 0);
        nuevoTotal = subtotal + impuesto;
      }

      const pagado = Number(orden.cuentaPorPagar?.montoPagado) || 0;
      const saldoTrasAjuste = Math.max(0, nuevoTotal - pagado);
      if (abonoMonto > saldoTrasAjuste + 0.01) {
        throw new Error(
          `El abono excede el saldo pendiente tras el ajuste ($${saldoTrasAjuste.toFixed(2)}).`,
        );
      }
    }

    return this.repo.updateOrden(id, data);
  }

  async editarOrden(
    id: string,
    data: {
      fecha?: string;
      concepto?: string;
      notas?: string;
      proyectoId?: string | null;
      impuesto?: number;
      detalles: {
        id?: string;
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        materialId?: string | null;
        isCustom?: boolean;
      }[];
      editadoPorId: string;
      abonoMonto?: number;
      metodoPagoId?: string | null;
      abonoReferencia?: string;
    }
  ): Promise<OrdenCompraData> {
    if (!data.detalles || data.detalles.length === 0) {
      throw new Error('La orden debe conservar al menos un ítem.');
    }
    for (const d of data.detalles) {
      if (d.cantidad <= 0) throw new Error(`La cantidad de "${d.descripcion}" debe ser mayor a 0.`);
      if (d.precioUnitario < 0) throw new Error(`El precio de "${d.descripcion}" no puede ser negativo.`);
    }
    if (data.abonoMonto && data.abonoMonto > 0 && !data.metodoPagoId) {
      throw new Error('Debe seleccionar un método de pago para registrar el pago inicial.');
    }
    return this.repo.editarOrdenConReconciliacion(id, {
      ...data,
      impuesto: data.impuesto ?? 0,
    });
  }

  // ── Abonos ─────────────────────────────────────────────────────────────────

  getAbonosByOrden(ordenId: string): Promise<AbonoCompraData[]> {
    return this.repo.findAbonosByOrden(ordenId);
  }

  async registrarAbono(data: {
    ordenCompraId: string;
    metodoPagoId: string;
    monto: number;
    referencia?: string;
    registradoPorUserId?: string | null;
  }): Promise<AbonoCompraData> {
    if (data.monto <= 0) throw new Error('El monto del abono debe ser mayor a 0.');

    const orden = await this.repo.findOrdenById(data.ordenCompraId);
    if (!orden) throw new Error('Orden de compra no encontrada.');

    const cxp = orden.cuentaPorPagar;
    if (!cxp) throw new Error('No se encontró cuenta por pagar para esta orden.');

    if (cxp.estado === 'pagado') {
      throw new Error('Esta orden ya está completamente pagada.');
    }

    if (data.monto > cxp.saldo) {
      throw new Error(`El abono excede el saldo pendiente. Saldo disponible: $${cxp.saldo.toFixed(2)}`);
    }

    // The repository validates and records payment + balance in one transaction.
    return this.repo.createAbono(data);
  }

  async eliminarAbono(ordenCompraId: string, abonoId: string): Promise<void> {
    const orden = await this.repo.findOrdenById(ordenCompraId);
    if (!orden) throw new Error('Orden de compra no encontrada.');

    if (orden.estado === 'anulada') throw new Error('Los pagos de una orden anulada forman parte del historial y no pueden eliminarse.');
    const abonos = await this.repo.findAbonosByOrden(ordenCompraId);
    if (!abonos || abonos.length === 0) {
      throw new Error('No existen abonos registrados para esta orden de compra.');
    }

    const abonosSorted = abonos.slice().sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    const lastAbono = abonosSorted[abonosSorted.length - 1];

    if (lastAbono.id !== String(abonoId)) {
      throw new Error('Solo se puede eliminar el último abono registrado.');
    }

    await this.repo.deleteAbono(abonoId, ordenCompraId, lastAbono.monto);
  }

  // ── Cuentas por Pagar ──────────────────────────────────────────────────────

  getCuentasPorPagar(options?: {
    page?: number;
    limit?: number;
    estado?: string;
  }): Promise<{ items: CuentaPorPagarData[]; total: number }> {
    return this.repo.findAllCuentasPorPagar(options);
  }

  async createCuentaPorPagarManual(input: CreateCuentaPorPagarManualInput): Promise<CuentaPorPagarData> {
    if (!input.concepto || !input.concepto.trim()) {
      throw new Error('El concepto o descripción de la cuenta es requerido.');
    }
    if (!input.montoTotal || Number(input.montoTotal) <= 0) {
      throw new Error('El monto total debe ser mayor a 0.');
    }
    return this.repo.createCuentaPorPagarManual(input);
  }

  // ── Métodos de Pago ────────────────────────────────────────────────────────

  getMetodosPago(desde?: Date, hasta?: Date): Promise<MetodoPagoData[]> {
    return this.repo.findAllMetodosPago(desde, hasta);
  }

  async createMetodoPago(data: { nombre: string; descripcion?: string; tipo?: string }): Promise<MetodoPagoData> {
    if (!data.nombre || !data.nombre.trim()) {
      throw new Error('El nombre del método de pago es requerido.');
    }
    return this.repo.createMetodoPago({ 
      ...data, 
      nombre: data.nombre.trim(),
      tipo: data.tipo || 'EFECTIVO'
    });
  }

  async updateMetodoPago(id: string, data: { nombre?: string; descripcion?: string; activo?: boolean; tipo?: string }): Promise<MetodoPagoData> {
    return this.repo.updateMetodoPago(id, data);
  }

  async deleteMetodoPago(id: string): Promise<void> {
    return this.repo.deleteMetodoPago(id);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getComprasStats(): Promise<{
    totalOrdenes: number;
    pendientes: number;
    totalGastado: number;
    totalDeuda: number;
  }> {
    return this.repo.getComprasStats();
  }

  recepcionarOrden(id: string, userId: string, payload: RecepcionInput): Promise<OrdenCompraData> {
    return this.repo.recepcionarOrdenAtomica(id, userId, payload);
  }
  previewAnulacion(id: string) { return this.repo.previewAnulacion(id); }
  anularOrden(id: string, userId: string, input: AnulacionInput) { return this.repo.anularOrden(id, userId, input); }

  // ── Cheques Posfechados ─────────────────────────────────────────────────────

  getCheques(options?: { estado?: string; ordenCompraId?: string }) {
    return this.repo.findAllChequesCompra(options);
  }

  async crearChequePosfechado(input: {
    ordenCompraId: string;
    metodoPagoId: string;
    numeroCheque: string;
    monto: number;
    fechaCobro: Date | string;
    referencia?: string;
    registradoPorUserId?: string;
  }) {
    if (!input.ordenCompraId) throw new Error('Se requiere ID de Orden de Compra.');
    if (!input.metodoPagoId) throw new Error('Se requiere seleccionar la cuenta/banco de origen.');
    if (!input.numeroCheque?.trim()) throw new Error('Se requiere ingresar el número de cheque.');
    if (!input.monto || input.monto <= 0) throw new Error('El monto del cheque debe ser mayor a 0.');
    if (!input.fechaCobro) throw new Error('Se requiere la fecha de cobro/emisión del cheque.');

    const fechaCobroDate = new Date(input.fechaCobro);
    if (isNaN(fechaCobroDate.getTime())) throw new Error('La fecha de cobro no es válida.');

    return this.repo.createChequeCompra({
      ordenCompraId: input.ordenCompraId,
      metodoPagoId: input.metodoPagoId,
      numeroCheque: input.numeroCheque.trim(),
      monto: input.monto,
      fechaCobro: fechaCobroDate,
      referencia: input.referencia?.trim() || `Cheque Posfechado N° ${input.numeroCheque.trim()}`,
      registradoPorUserId: input.registradoPorUserId,
    });
  }

  async procesarCheque(id: string) {
    if (!id) throw new Error('ID de cheque inválido.');
    return this.repo.procesarChequeCompra(id);
  }

  async editarChequePosfechado(id: string, data: { numeroCheque?: string; fechaCobro?: Date | string; monto?: number; metodoPagoId?: string }) {
    if (!id) throw new Error('ID de cheque inválido.');
    let fechaCobroDate: Date | undefined = undefined;
    if (data.fechaCobro) {
      fechaCobroDate = new Date(data.fechaCobro);
      if (isNaN(fechaCobroDate.getTime())) throw new Error('La fecha de cobro no es válida.');
    }
    return this.repo.updateChequeCompra(id, {
      numeroCheque: data.numeroCheque?.trim(),
      fechaCobro: fechaCobroDate,
      monto: data.monto ? Number(data.monto) : undefined,
      metodoPagoId: data.metodoPagoId,
    });
  }

  async eliminarChequePosfechado(id: string) {
    if (!id) throw new Error('ID de cheque inválido.');
    return this.repo.deleteChequeCompra(id);
  }
}
