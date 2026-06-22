import type {
  ComprasRepositoryPort,
  OrdenCompraData,
  ProveedorData,
  MetodoPagoData,
  AbonoCompraData,
  CuentaPorPagarData,
  DetalleCompraInput,
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
    estadoPago?: string;
    creadorRol?: string;
  }): Promise<{ items: OrdenCompraData[]; total: number }> {
    return this.repo.findAllOrdenes(options);
  }

  getOrdenById(id: string): Promise<OrdenCompraData | null> {
    return this.repo.findOrdenById(id);
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
  }): Promise<OrdenCompraData> {
    const orden = await this.repo.findOrdenById(id);
    if (!orden) throw new Error('Orden de compra no encontrada.');
    return this.repo.updateOrden(id, data);
  }

  async deleteOrden(id: string): Promise<void> {
    const orden = await this.repo.findOrdenById(id);
    if (!orden) throw new Error('Orden de compra no encontrada.');
    return this.repo.deleteOrden(id);
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

    // Create the abono
    const abono = await this.repo.createAbono(data);

    // Update CxP
    const newMontoPagado = cxp.montoPagado + data.monto;
    const newSaldo = cxp.montoTotal - newMontoPagado;
    const newEstado = newSaldo <= 0 ? 'pagado' : 'parcial';

    await this.repo.updateCuentaPorPagar(cxp.id, {
      montoPagado: newMontoPagado,
      saldo: Math.max(0, newSaldo),
      estado: newEstado,
    });

    // Update orden payment status
    await this.repo.updateOrden(data.ordenCompraId, {
      estado: undefined,
    });

    // Update the order's payment status directly
    const ordenUpdate: any = {};
    ordenUpdate.estadoPago = newEstado === 'pagado' ? 'pagado' : 'parcial';

    // We need a small helper to update just the estadoPago field
    // For now, use updateOrden which handles it
    await this.repo.updateOrden(data.ordenCompraId, ordenUpdate);

    return abono;
  }

  // ── Cuentas por Pagar ──────────────────────────────────────────────────────

  getCuentasPorPagar(options?: {
    page?: number;
    limit?: number;
    estado?: string;
  }): Promise<{ items: CuentaPorPagarData[]; total: number }> {
    return this.repo.findAllCuentasPorPagar(options);
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

  async recepcionarOrden(
    id: string,
    usuarioId: string,
    detallesRecibidos: { materialId?: string | null; cantidad: number }[]
  ): Promise<OrdenCompraData> {
    const orden = await this.repo.findOrdenById(id);
    if (!orden) {
      throw new Error('Orden de compra no encontrada.');
    }
    if (orden.estado !== 'aprobada') {
      throw new Error('Solo se pueden recepcionar órdenes aprobadas.');
    }

    // Adjust stocks and insert movements for inventory items
    for (const item of detallesRecibidos) {
      if (item.materialId && item.cantidad > 0) {
        await this.repo.adjustMaterialStock(item.materialId, item.cantidad);
        await this.repo.createMaterialMovimiento({
          materialId: item.materialId,
          tipo: 'entrada',
          cantidad: item.cantidad,
          motivo: `Recepción de Orden de Compra ${orden.numero}`,
          userId: usuarioId,
        });
      }
    }

    // Update status to received
    return this.repo.updateOrden(id, { estado: 'recibida' });
  }
}
