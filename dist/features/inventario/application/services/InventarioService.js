export class InventarioService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    // ── Materiales ──────────────────────────────────────────────────────────────
    getInventario(options) {
        return this.repo.findAll(options);
    }
    getStats() {
        return this.repo.getStats();
    }
    getUnidadesMedida() {
        return this.repo.findAllUnidades();
    }
    getMaterialById(id) {
        return this.repo.findById(id);
    }
    createMaterial(data) {
        return this.repo.create(data);
    }
    updateMaterial(id, data) {
        return this.repo.update(id, data);
    }
    async deleteMaterial(id) {
        const mat = await this.repo.findById(id);
        if (!mat)
            throw new Error('Material no encontrado.');
        return this.repo.delete(id);
    }
    // ── Movimientos ──────────────────────────────────────────────────────────────
    getMovimientos(materialId) {
        return this.repo.listMovimientos(materialId);
    }
    async registrarMovimiento(data) {
        const mat = await this.repo.findById(data.materialId);
        if (!mat)
            throw new Error('Material no encontrado.');
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
    getPrestamos(estado) {
        return this.repo.listPrestamos(estado);
    }
    async registrarPrestamo(data) {
        const mat = await this.repo.findById(data.materialId);
        if (!mat)
            throw new Error('Material no encontrado.');
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
    async devolverPrestamo(id, observacionDevolucion) {
        const prestamo = await this.repo.findPrestamoById(id);
        if (!prestamo)
            throw new Error('Préstamo no encontrado.');
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
    async getMaterialHistorial(id) {
        return this.repo.getMaterialHistorial(id);
    }
}
