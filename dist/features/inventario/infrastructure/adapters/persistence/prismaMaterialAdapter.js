export class PrismaMaterialAdapter {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Materiales ──────────────────────────────────────────────────────────────
    mapRow(row) {
        if (!row)
            return null;
        const { unidadMedida, ...rest } = row;
        return {
            ...rest,
            unidadMedida: row.unidadMedida?.nombre || 'unidades',
        };
    }
    async findAll(options) {
        const { tipo, page, limit, search, categoria } = options || {};
        const where = {};
        if (tipo) {
            where.tipo = tipo;
        }
        if (categoria) {
            where.categoria = categoria;
        }
        if (search) {
            where.OR = [
                { nombre: { contains: search, mode: 'insensitive' } },
                { codigo: { contains: search, mode: 'insensitive' } },
                { marca: { contains: search, mode: 'insensitive' } },
                { modelo: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (page !== undefined && limit !== undefined) {
            const skip = (page - 1) * limit;
            const [rows, total] = await Promise.all([
                this.prisma.material.findMany({
                    where,
                    include: { unidadMedida: true },
                    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
                    skip,
                    take: limit,
                }),
                this.prisma.material.count({ where }),
            ]);
            return {
                items: rows.map(r => this.mapRow(r)),
                total,
            };
        }
        else {
            const rows = await this.prisma.material.findMany({
                where,
                include: { unidadMedida: true },
                orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
            });
            return rows.map(r => this.mapRow(r));
        }
    }
    async findById(id) {
        const row = await this.prisma.material.findUnique({
            where: { id },
            include: { unidadMedida: true },
        });
        return this.mapRow(row);
    }
    async create(data) {
        const { unidadMedida, ...rest } = data;
        let unidadMedidaId = data.unidadMedidaId;
        if (!unidadMedidaId && unidadMedida) {
            const unit = await this.prisma.unidadMedida.upsert({
                where: { nombre: unidadMedida },
                update: {},
                create: { nombre: unidadMedida }
            });
            unidadMedidaId = unit.id;
        }
        const row = await this.prisma.material.create({
            data: {
                ...rest,
                unidadMedidaId,
            },
            include: { unidadMedida: true }
        });
        return this.mapRow(row);
    }
    async update(id, data) {
        const { unidadMedida, ...rest } = data;
        let unidadMedidaId = data.unidadMedidaId;
        if (!unidadMedidaId && unidadMedida) {
            const unit = await this.prisma.unidadMedida.upsert({
                where: { nombre: unidadMedida },
                update: {},
                create: { nombre: unidadMedida }
            });
            unidadMedidaId = unit.id;
        }
        const row = await this.prisma.material.update({
            where: { id },
            data: {
                ...rest,
                ...(unidadMedidaId ? { unidadMedidaId } : {}),
            },
            include: { unidadMedida: true }
        });
        return this.mapRow(row);
    }
    async delete(id) {
        await this.prisma.material.delete({ where: { id } });
    }
    async getStats() {
        const totalMateriales = await this.prisma.material.count();
        const lowStockResult = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "materiales" WHERE "stock_actual" > 0 AND "stock_actual" <= "stock_minimo"`);
        const totalLowStock = lowStockResult[0]?.count || 0;
        const activeLoans = await this.prisma.prestamo.count({
            where: { estado: 'prestado' },
        });
        const returnedLoans = await this.prisma.prestamo.count({
            where: { estado: 'devuelto' },
        });
        return {
            totalMateriales,
            totalLowStock,
            activeLoans,
            returnedLoans,
        };
    }
    async findAllUnidades() {
        return this.prisma.unidadMedida.findMany({
            orderBy: { nombre: 'asc' }
        });
    }
    // ── Movimientos ──────────────────────────────────────────────────────────────
    async listMovimientos(materialId) {
        const rows = await this.prisma.movimientoInventario.findMany({
            where: materialId ? { materialId } : undefined,
            orderBy: { fecha: 'desc' },
        });
        return rows;
    }
    async createMovimiento(data) {
        const row = await this.prisma.movimientoInventario.create({
            data: {
                tipo: data.tipo,
                cantidad: data.cantidad,
                motivo: data.motivo,
                userId: data.userId,
                material: { connect: { id: data.materialId } },
            },
        });
        return row;
    }
    // ── Préstamos ────────────────────────────────────────────────────────────────
    async listPrestamos(estado) {
        const rows = await this.prisma.prestamo.findMany({
            where: estado ? { estado } : undefined,
            include: {
                material: { select: { nombre: true, tipo: true, unidadMedida: true } },
                responsable: { select: { nombre: true, username: true } },
            },
            orderBy: { fechaSalida: 'desc' },
        });
        return rows;
    }
    async findPrestamoById(id) {
        const row = await this.prisma.prestamo.findUnique({
            where: { id },
            include: {
                material: { select: { nombre: true, tipo: true, unidadMedida: true } },
                responsable: { select: { nombre: true, username: true } },
            },
        });
        return row;
    }
    async createPrestamo(data) {
        const row = await this.prisma.prestamo.create({
            data: {
                cantidad: data.cantidad,
                comentarios: data.comentarios,
                estado: data.estado ?? 'prestado',
                material: { connect: { id: data.materialId } },
                responsable: { connect: { id: data.responsableId } },
            },
            include: {
                material: { select: { nombre: true, tipo: true, unidadMedida: true } },
                responsable: { select: { nombre: true, username: true } },
            },
        });
        return row;
    }
    async returnPrestamo(id, fechaRetorno) {
        const row = await this.prisma.prestamo.update({
            where: { id },
            data: { fechaRetorno, estado: 'devuelto' },
            include: {
                material: { select: { nombre: true, tipo: true, unidadMedida: true } },
                responsable: { select: { nombre: true, username: true } },
            },
        });
        return row;
    }
    // ── Stock ───────────────────────────────────────────────────────────────────
    async adjustStock(materialId, delta) {
        await this.prisma.material.update({
            where: { id: materialId },
            data: { stockActual: { increment: delta } },
        });
    }
}
