// ── Domain types ────────────────────────────────────────────────────────────

export interface ProveedorData {
  id: string;
  nombre: string;
  ruc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  contacto?: string | null;
  estado: string;
  fechaCreacion: Date;
}

export interface MetodoPagoData {
  id: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  tipo: string;
  saldoActual?: number;
  ingresosPeriod?: number;
  egresosPeriod?: number;
  netoPeriod?: number;
}

export interface DetalleCompraInput {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  materialId?: string | null;
}

export interface DetalleCompraData extends DetalleCompraInput {
  id: string;
  ordenCompraId: string;
  subtotal: number;
  cantidadRecibida?: number | null;
  descargableInventario?: boolean | null;
  fechaRecepcion?: Date | null;
}

export interface AbonoCompraData {
  id: string;
  ordenCompraId: string;
  metodoPagoId: string;
  metodoPago?: MetodoPagoData;
  monto: number;
  fecha: Date;
  referencia?: string | null;
}

export interface CuentaPorPagarData {
  id: string;
  ordenCompraId: string;
  ordenCompra?: OrdenCompraData;
  montoTotal: number;
  montoPagado: number;
  saldo: number;
  fechaVencimiento?: Date | null;
  estado: string;
}

export interface OrdenCompraData {
  id: string;
  numero: string;
  proveedorId?: string | null;
  proveedor?: ProveedorData;
  usuarioId: string;
  usuario?: { id: string; nombre: string; email: string; rol?: string | null };
  fecha: Date;
  subtotal: number;
  impuesto: number;
  total: number;
  estado: string;
  estadoPago: string;
  concepto?: string | null;
  notas?: string | null;
  fechaCreacion: Date;
  fechaAprobacion?: Date | null;
  aprobadoPorId?: string | null;
  aprobadoPor?: { id: string; nombre: string; email: string; rol?: string | null } | null;
  fechaRecepcion?: Date | null;
  notasRecepcion?: string | null;
  recibidoPorId?: string | null;
  recibidoPor?: { id: string; nombre: string; email: string; rol?: string | null } | null;
  detalles?: DetalleCompraData[];
  abonos?: AbonoCompraData[];
  cuentaPorPagar?: CuentaPorPagarData | null;
  proyectoId?: string | null;
}

export interface ComprasRepositoryPort {
  // ── Proveedores ──
  findAllProveedores(): Promise<ProveedorData[]>;
  createProveedor(data: {
    nombre: string;
    ruc?: string | null;
    tipo?: string;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    contacto?: string | null;
    notas?: string | null;
  }): Promise<ProveedorData>;
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
  }): Promise<ProveedorData>;
  deleteProveedor(id: string): Promise<void>;

  // ── Órdenes de Compra ──
  findAllOrdenes(options?: {
    page?: number;
    limit?: number;
    search?: string;
    estado?: string;
    estados?: string[];
    estadoPago?: string;
    creadorRol?: string;
    creadorId?: string;
    pendienteRecepcion?: boolean;
  }): Promise<{ items: OrdenCompraData[]; total: number }>;

  findOrdenById(id: string): Promise<OrdenCompraData | null>;

  createOrden(data: {
    proveedorId?: string;
    usuarioId: string;
    fecha?: Date;
    impuesto?: number;
    concepto?: string;
    notas?: string;
    detalles: DetalleCompraInput[];
    fechaVencimiento?: Date | null;
    proyectoId?: string | null;
  }): Promise<OrdenCompraData>;

  updateOrden(id: string, data: {
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
    fechaRecepcion?: Date;
    notasRecepcion?: string;
    recibidoPorId?: string;
  }): Promise<OrdenCompraData>;

  updateDetalleRecepcion(id: string, data: {
    cantidadRecibida: number;
    descargableInventario: boolean;
    fechaRecepcion?: Date;
  }): Promise<void>;

  deleteOrden(id: string): Promise<void>;

  getNextOrdenNumero(): Promise<string>;

  // ── Abonos ──
  findAbonosByOrden(ordenId: string): Promise<AbonoCompraData[]>;

  createAbono(data: {
    ordenCompraId: string;
    metodoPagoId: string;
    monto: number;
    referencia?: string;
  }): Promise<AbonoCompraData>;

  // ── Cuentas por Pagar ──
  findAllCuentasPorPagar(options?: {
    page?: number;
    limit?: number;
    estado?: string;
  }): Promise<{ items: CuentaPorPagarData[]; total: number }>;

  updateCuentaPorPagar(id: string, data: {
    montoPagado: number;
    saldo: number;
    estado: string;
  }): Promise<CuentaPorPagarData>;

  // ── Métodos de Pago ──
  findAllMetodosPago(desde?: Date, hasta?: Date): Promise<MetodoPagoData[]>;
  createMetodoPago(data: { nombre: string; descripcion?: string; tipo?: string }): Promise<MetodoPagoData>;
  updateMetodoPago(id: string, data: { nombre?: string; descripcion?: string; activo?: boolean; tipo?: string }): Promise<MetodoPagoData>;
  deleteMetodoPago(id: string): Promise<void>;

  // ── Stats ──
  getComprasStats(): Promise<{
    totalOrdenes: number;
    pendientes: number;
    totalGastado: number;
    totalDeuda: number;
  }>;

  // ── Inventario Helpers ──
  adjustMaterialStock(materialId: string, cantidad: number): Promise<void>;
  createMaterialMovimiento(data: {
    materialId: string;
    tipo: string;
    cantidad: number;
    motivo: string;
    userId?: string | null;
  }): Promise<void>;
}
