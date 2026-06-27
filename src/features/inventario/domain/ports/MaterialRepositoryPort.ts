export interface MaterialData {
  id: string;
  nombre: string;
  tipo: string;
  unidadMedida: any;
  stockActual: number;
  stockMinimo: number;
  precioCosto: number;
  fechaCreacion: Date;
  codigo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  categoria?: string | null;
  estadoUso?: string | null;
  aCargo?: string | null;
  costoPromedioPonderado?: number;
}

export interface MovimientoData {
  id: string;
  materialId: string;
  tipo: string;
  cantidad: number;
  motivo: string;
  fecha: Date;
  userId?: string | null;
}

export interface PrestamoData {
  id: string;
  materialId: string;
  material?: { nombre: string; tipo: string; unidadMedida: string };
  responsableId: string;
  responsable?: { nombre: string; username: string };
  cantidad: number;
  fechaSalida: Date;
  fechaRetorno?: Date | null;
  fechaDevolucionEsperada?: Date | null;
  comentarios?: string | null;
  observacionDevolucion?: string | null;
  estado: string;
}

export interface MaterialRepositoryPort {
  // Materiales
  findAll(options?: {
    tipo?: string;
    page?: number;
    limit?: number;
    search?: string;
    categoria?: string;
  }): Promise<{ items: MaterialData[]; total: number } | MaterialData[]>;
  findById(id: string): Promise<MaterialData | null>;
  create(data: Omit<MaterialData, 'id' | 'fechaCreacion'>): Promise<MaterialData>;
  update(id: string, data: Partial<Omit<MaterialData, 'id' | 'fechaCreacion'>>): Promise<MaterialData>;
  delete(id: string): Promise<void>;

  // Estadísticas
  getStats(): Promise<{
    totalMateriales: number;
    totalLowStock: number;
    activeLoans: number;
    returnedLoans: number;
  }>;

  // Unidades de medida
  findAllUnidades(): Promise<any[]>;

  // Movimientos
  listMovimientos(materialId?: string): Promise<MovimientoData[]>;
  createMovimiento(data: Omit<MovimientoData, 'id' | 'fecha'> & { fecha?: Date }): Promise<MovimientoData>;

  // Préstamos
  listPrestamos(estado?: string): Promise<PrestamoData[]>;
  findPrestamoById(id: string): Promise<PrestamoData | null>;
  createPrestamo(data: Omit<PrestamoData, 'id' | 'fechaSalida'>): Promise<PrestamoData>;
  returnPrestamo(id: string, fechaRetorno: Date, observacionDevolucion?: string | null): Promise<PrestamoData>;

  // Historial
  getMaterialHistorial(id: string): Promise<any>;

  // Stock helpers
  adjustStock(materialId: string, delta: number): Promise<void>;
}
