import type { MaterialRepositoryPort, MaterialData, MovimientoData, PrestamoData } from '../../domain/ports/MaterialRepositoryPort.js';

export class InventarioService {
  constructor(private readonly repo: MaterialRepositoryPort) {}

  // ── Materiales ──────────────────────────────────────────────────────────────

  getInventario(options?: {
    tipo?: string;
    page?: number;
    limit?: number;
    search?: string;
    categoria?: string;
  }): Promise<{ items: MaterialData[]; total: number } | MaterialData[]> {
    return this.repo.findAll(options);
  }

  getStats(): Promise<{
    totalMateriales: number;
    totalLowStock: number;
    activeLoans: number;
    returnedLoans: number;
  }> {
    return this.repo.getStats();
  }

  getUnidadesMedida(): Promise<any[]> {
    return this.repo.findAllUnidades();
  }

  getMaterialById(id: string): Promise<MaterialData | null> {
    return this.repo.findById(id);
  }

  createMaterial(data: Omit<MaterialData, 'id' | 'fechaCreacion'>): Promise<MaterialData> {
    return this.repo.create(data);
  }

  updateMaterial(id: string, data: Partial<Omit<MaterialData, 'id' | 'fechaCreacion'>>): Promise<MaterialData> {
    return this.repo.update(id, data);
  }

  async deleteMaterial(id: string): Promise<void> {
    const mat = await this.repo.findById(id);
    if (!mat) throw new Error('Material no encontrado.');
    return this.repo.delete(id);
  }

  // ── Movimientos ──────────────────────────────────────────────────────────────

  getMovimientos(materialId?: string): Promise<MovimientoData[]> {
    return this.repo.listMovimientos(materialId);
  }

  async registrarMovimiento(data: Omit<MovimientoData, 'id' | 'fecha'> & { fecha?: Date }): Promise<MovimientoData> {
    const mat = await this.repo.findById(data.materialId);
    if (!mat) throw new Error('Material no encontrado.');

    const delta = data.tipo === 'entrada' ? data.cantidad : -data.cantidad;
    const unitLabel = typeof mat.unidadMedida === 'string' ? mat.unidadMedida : (mat.unidadMedida?.abreviacion || mat.unidadMedida?.nombre || 'unid');
    if (data.tipo === 'salida' && mat.stockActual + delta < 0) {
      throw new Error(`Stock insuficiente. Disponible: ${mat.stockActual} ${unitLabel}.`);
    }

    const mov = await this.repo.createMovimiento(data);
    await this.repo.adjustStock(data.materialId, delta);
    return mov;
  }

  // ── Préstamos ────────────────────────────────────────────────────────────────

  getPrestamos(estado?: string): Promise<PrestamoData[]> {
    return this.repo.listPrestamos(estado);
  }

  async registrarPrestamo(data: Omit<PrestamoData, 'id' | 'fechaSalida'>): Promise<PrestamoData> {
    const mat = await this.repo.findById(data.materialId);
    if (!mat) throw new Error('Material no encontrado.');
    if (mat.tipo !== 'herramienta') {
      throw new Error('Solo se pueden prestar herramientas. Use movimientos para consumibles.');
    }
    if (mat.stockActual < data.cantidad) {
      throw new Error(`Stock insuficiente. Disponible: ${mat.stockActual} unidad(es).`);
    }

    const prestamo = await this.repo.createPrestamo({ ...data, estado: 'prestado' });
    await this.repo.adjustStock(data.materialId, -data.cantidad);

    // Sincronizar estado del material
    const responsibleName = prestamo.responsable?.nombre || 'Usuario';
    await this.repo.update(data.materialId, {
      estadoUso: 'EN USO',
      aCargo: responsibleName,
    });

    return prestamo;
  }

  async devolverPrestamo(id: string, observacionDevolucion?: string | null): Promise<PrestamoData> {
    const prestamo = await this.repo.findPrestamoById(id);
    if (!prestamo) throw new Error('Préstamo no encontrado.');
    if (prestamo.estado === 'devuelto') {
      throw new Error('Esta herramienta ya fue devuelta.');
    }

    const updated = await this.repo.returnPrestamo(id, new Date(), observacionDevolucion);
    await this.repo.adjustStock(prestamo.materialId, prestamo.cantidad);

    // Sincronizar estado del material
    await this.repo.update(prestamo.materialId, {
      estadoUso: 'BODEGA',
      aCargo: null,
    });

    return updated;
  }
}
