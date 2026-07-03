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
        // Auto-calculate descargaStock and esPrestable from subtipo if not explicitly set
        const enriched = this.enrichMaterialDefaults(data);
        return this.repo.create(enriched);
    }
    /** Auto-calculate descargaStock/esPrestable from subtipo */
    enrichMaterialDefaults(data) {
        const subtipo = data.subtipo || 'consumible_descargable';
        const defaults = {
            herramienta: { descargaStock: false, esPrestable: true, tipo: 'herramienta' },
            consumible_descargable: { descargaStock: true, esPrestable: false, tipo: 'consumible' },
            consumible_registro: { descargaStock: false, esPrestable: false, tipo: 'consumible' },
            activo_fijo: { descargaStock: false, esPrestable: false, tipo: 'consumible' },
        };
        const d = defaults[subtipo] || defaults.consumible_descargable;
        return {
            ...data,
            subtipo,
            descargaStock: data.descargaStock ?? d.descargaStock,
            esPrestable: data.esPrestable ?? d.esPrestable,
            tipo: data.tipo || d.tipo,
        };
    }
    updateMaterial(id, data) {
        const enriched = data.subtipo ? this.enrichMaterialDefaults(data) : data;
        return this.repo.update(id, enriched);
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
        const unitLabel = typeof mat.unidadMedida === 'string' ? mat.unidadMedida : (mat.unidadMedida?.abreviacion || mat.unidadMedida?.nombre || 'unid');
        // Solo ajustar stock si el material es descargable del inventario
        if (mat.descargaStock) {
            const delta = data.tipo === 'entrada' ? data.cantidad : -data.cantidad;
            if (data.tipo === 'salida' && mat.stockActual + delta < 0) {
                throw new Error(`Stock insuficiente. Disponible: ${mat.stockActual} ${unitLabel}.`);
            }
            const mov = await this.repo.createMovimiento(data);
            await this.repo.adjustStock(data.materialId, delta);
            return mov;
        }
        else {
            // Material de solo registro: guardar el movimiento como log pero NO ajustar stock
            const mov = await this.repo.createMovimiento(data);
            return mov;
        }
    }
    // ── Préstamos ────────────────────────────────────────────────────────────────
    getPrestamos(estado) {
        return this.repo.listPrestamos(estado);
    }
    async registrarPrestamo(data) {
        const mat = await this.repo.findById(data.materialId);
        if (!mat)
            throw new Error('Material no encontrado.');
        if (!mat.esPrestable) {
            throw new Error('Este material no es prestable. Solo herramientas marcadas como prestables pueden asignarse.');
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
