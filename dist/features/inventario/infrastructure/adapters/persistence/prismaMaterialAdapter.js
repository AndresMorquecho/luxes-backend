import { formatDateOnly } from '../../../../../shared/utils/dateOnly.js';
const ESTADOS_COMPRA_VALIDOS = new Set(['aprobada', 'recibida', 'parcialmente_recibida']);
export class PrismaMaterialAdapter {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Materiales ──────────────────────────────────────────────────────────────
    mapRow(row) {
        if (!row)
            return null;
        const { unidadMedida, detallesCompra, ...rest } = row;
        const purchases = detallesCompra || [];
        const approvedPurchases = purchases.filter((d) => {
            const estado = String(d.ordenCompra?.estado || '').toLowerCase();
            return ESTADOS_COMPRA_VALIDOS.has(estado);
        });
        let cpp = row.precioCosto || 0;
        let ultimaFechaCompra = null;
        if (approvedPurchases.length > 0) {
            const totalCost = approvedPurchases.reduce((sum, d) => sum + (d.cantidad * d.precioUnitario), 0);
            const totalQty = approvedPurchases.reduce((sum, d) => sum + d.cantidad, 0);
            if (totalQty > 0) {
                cpp = totalCost / totalQty;
            }
            const fechasCompra = approvedPurchases
                .map((d) => d.fechaRecepcion || d.ordenCompra?.fechaRecepcion || d.ordenCompra?.fechaAprobacion || d.ordenCompra?.fecha)
                .map((f) => formatDateOnly(f))
                .filter((f) => !!f);
            if (fechasCompra.length > 0) {
                ultimaFechaCompra = fechasCompra.sort().reverse()[0];
            }
        }
        return {
            ...rest,
            costoPromedioPonderado: cpp,
            ultimaFechaCompra,
            unidadMedida: row.unidadMedida ? {
                id: row.unidadMedida.id,
                nombre: row.unidadMedida.nombre,
                abreviacion: row.unidadMedida.abreviacion
            } : { nombre: 'unidades', abreviacion: 'unid' },
            aCargoEmpleado: row.aCargoEmpleado ? {
                id: row.aCargoEmpleado.id,
                nombre: row.aCargoEmpleado.nombre
            } : null,
        };
    }
    async findAll(options) {
        const { tipo, page, limit, search, categoria, incluirDerivados } = options || {};
        // Excluir: rollos agotados/ocultos siempre.
        // Rollos derivados ([R001], [R002]) se excluyen por defecto (OC, préstamos, etc.).
        // Usar incluirDerivados=true solo desde la vista de inventario de impresión.
        const where = { ocultado: false };
        if (!incluirDerivados) {
            where.materialBaseId = null;
        }
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
        // NOTA: El Prisma client puede no reconocer materialBaseId/ocultado en WHERE
        // si el .dll no fue regenerado (EPERM al generar). Por eso aplicamos filtro JS
        // post-consulta como fallback de seguridad.
        const applyJsFilter = (rows) => {
            return rows
                .filter(r => !r.ocultado) // ocultado siempre excluir
                .filter(r => incluirDerivados || !r.materialBaseId); // derivados según flag
        };
        if (page !== undefined && limit !== undefined) {
            const skip = (page - 1) * limit;
            const [rawRows] = await Promise.all([
                this.prisma.material.findMany({
                    where,
                    include: {
                        unidadMedida: true,
                        aCargoEmpleado: { select: { id: true, nombre: true } },
                        detallesCompra: { include: { ordenCompra: true } }
                    },
                    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
                }),
            ]);
            const filtered = applyJsFilter(rawRows);
            const mapped = filtered.map(r => this.mapRow(r));
            if (tipo === 'consumible') {
                mapped.sort((a, b) => {
                    const da = a.ultimaFechaCompra || '';
                    const db = b.ultimaFechaCompra || '';
                    if (db !== da)
                        return db.localeCompare(da);
                    return (a.nombre || '').localeCompare(b.nombre || '', 'es');
                });
            }
            return {
                items: mapped.slice(skip, skip + limit),
                total: mapped.length,
            };
        }
        else {
            const rawRows = await this.prisma.material.findMany({
                where,
                include: {
                    unidadMedida: true,
                    aCargoEmpleado: { select: { id: true, nombre: true } },
                    detallesCompra: { include: { ordenCompra: true } }
                },
                orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
            });
            return applyJsFilter(rawRows).map(r => this.mapRow(r));
        }
    }
    async findById(id) {
        const row = await this.prisma.material.findUnique({
            where: { id },
            include: {
                unidadMedida: true,
                aCargoEmpleado: { select: { id: true, nombre: true } },
                detallesCompra: { include: { ordenCompra: true } }
            },
        });
        return this.mapRow(row);
    }
    async create(data) {
        const { unidadMedida, costoPromedioPonderado, ultimaFechaCompra, ...rest } = data;
        if (rest.codigo && typeof rest.codigo === 'string' && rest.codigo.trim()) {
            const cleanCode = rest.codigo.trim();
            const existing = await this.prisma.material.findFirst({
                where: {
                    codigo: { equals: cleanCode, mode: 'insensitive' },
                    ocultado: false,
                },
                select: { id: true, nombre: true, codigo: true },
            });
            if (existing) {
                throw new Error(`El código "${cleanCode}" ya está en uso por el producto "${existing.nombre}".`);
            }
        }
        let unidadMedidaId = data.unidadMedidaId;
        const unitName = typeof unidadMedida === 'string' ? unidadMedida : unidadMedida?.nombre;
        if (!unidadMedidaId && unitName) {
            const unit = await this.prisma.unidadMedida.upsert({
                where: { nombre: unitName },
                update: {},
                create: { nombre: unitName }
            });
            unidadMedidaId = unit.id;
        }
        const row = await this.prisma.material.create({
            data: {
                ...rest,
                unidadMedidaId,
            },
            include: {
                unidadMedida: true,
                aCargoEmpleado: { select: { id: true, nombre: true } },
            }
        });
        return this.mapRow(row);
    }
    async update(id, data) {
        const { unidadMedida, costoPromedioPonderado, ultimaFechaCompra, ...rest } = data;
        if (rest.codigo && typeof rest.codigo === 'string' && rest.codigo.trim()) {
            const cleanCode = rest.codigo.trim();
            const existing = await this.prisma.material.findFirst({
                where: {
                    codigo: { equals: cleanCode, mode: 'insensitive' },
                    id: { not: id },
                    ocultado: false,
                },
                select: { id: true, nombre: true, codigo: true },
            });
            if (existing) {
                throw new Error(`El código "${cleanCode}" ya está en uso por el producto "${existing.nombre}".`);
            }
        }
        let unidadMedidaId = data.unidadMedidaId;
        const unitName = typeof unidadMedida === 'string' ? unidadMedida : unidadMedida?.nombre;
        if (!unidadMedidaId && unitName) {
            const unit = await this.prisma.unidadMedida.upsert({
                where: { nombre: unitName },
                update: {},
                create: { nombre: unitName }
            });
            unidadMedidaId = unit.id;
        }
        const row = await this.prisma.material.update({
            where: { id },
            data: {
                ...rest,
                ...(unidadMedidaId ? { unidadMedidaId } : {}),
            },
            include: {
                unidadMedida: true,
                aCargoEmpleado: { select: { id: true, nombre: true } },
            }
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
                ...(data.fecha ? { fecha: data.fecha } : {}),
                material: { connect: { id: data.materialId } },
            },
        });
        return row;
    }
    // ── Préstamos ────────────────────────────────────────────────────────────────
    async listPrestamos(options) {
        return this.listPrestamosWithOptions(options);
    }
    buildPrestamosWhere(options) {
        const where = {};
        if (options.estado)
            where.estado = options.estado;
        if (options.responsableId)
            where.responsableId = options.responsableId;
        if (options.fechaInicio || options.fechaFin) {
            const fechaSalida = {};
            if (options.fechaInicio) {
                const start = new Date(options.fechaInicio);
                if (!Number.isNaN(start.getTime()))
                    fechaSalida.gte = start;
            }
            if (options.fechaFin) {
                const end = new Date(options.fechaFin);
                if (!Number.isNaN(end.getTime())) {
                    end.setHours(23, 59, 59, 999);
                    fechaSalida.lte = end;
                }
            }
            if (Object.keys(fechaSalida).length > 0)
                where.fechaSalida = fechaSalida;
        }
        if (options.searchTool?.trim()) {
            const term = options.searchTool.trim();
            where.material = {
                OR: [
                    { nombre: { contains: term, mode: 'insensitive' } },
                    { codigo: { contains: term, mode: 'insensitive' } },
                ],
            };
        }
        if (options.filterPersona?.trim()) {
            where.responsable = {
                nombre: { contains: options.filterPersona.trim(), mode: 'insensitive' },
            };
        }
        return where;
    }
    async listPrestamosWithOptions(options) {
        const where = this.buildPrestamosWhere(options || {});
        const include = {
            material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
            responsable: { select: { nombre: true, username: true } },
        };
        const page = options?.page;
        const limit = options?.limit;
        if (page && limit) {
            const skip = (page - 1) * limit;
            const [rows, total] = await Promise.all([
                this.prisma.prestamo.findMany({
                    where,
                    include,
                    orderBy: { fechaSalida: 'desc' },
                    skip,
                    take: limit,
                }),
                this.prisma.prestamo.count({ where }),
            ]);
            return { items: rows, total };
        }
        const rows = await this.prisma.prestamo.findMany({
            where,
            include,
            orderBy: { fechaSalida: 'desc' },
        });
        return rows;
    }
    async findPrestamoById(id) {
        const row = await this.prisma.prestamo.findUnique({
            where: { id },
            include: {
                material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
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
                fechaDevolucionEsperada: data.fechaDevolucionEsperada
                    ? new Date(data.fechaDevolucionEsperada)
                    : null,
                material: { connect: { id: data.materialId } },
                responsable: { connect: { id: data.responsableId } },
            },
            include: {
                material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
                responsable: { select: { nombre: true, username: true } },
            },
        });
        return row;
    }
    async returnPrestamo(id, fechaRetorno, observacionDevolucion) {
        const row = await this.prisma.prestamo.update({
            where: { id },
            data: {
                fechaRetorno,
                estado: 'devuelto',
                ...(observacionDevolucion != null && observacionDevolucion !== ''
                    ? { observacionDevolucion }
                    : {}),
            },
            include: {
                material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
                responsable: { select: { nombre: true, username: true } },
            },
        });
        return row;
    }
    async adjustStock(materialId, delta) {
        const updated = await this.prisma.material.update({
            where: { id: materialId },
            data: { stockActual: { increment: delta } },
            select: { stockActual: true, materialBaseId: true, subtipo: true },
        });
        // Auto-ocultar rollo agotado: solo aplica a rollos derivados (tienen materialBaseId)
        // y solo cuando el stock llega a 0 o menos
        if (updated.stockActual <= 0 &&
            updated.materialBaseId &&
            updated.subtipo === 'consumible_descargable') {
            await this.prisma.material.update({
                where: { id: materialId },
                data: { ocultado: true },
            });
        }
    }
    async getMaterialHistorial(idOrCodigo, options) {
        const material = await this.prisma.material.findFirst({
            where: {
                OR: [
                    { id: idOrCodigo },
                    { codigo: idOrCodigo }
                ]
            },
            include: { unidadMedida: true }
        });
        if (!material)
            throw new Error('Material no encontrado.');
        const id = material.id;
        // Build Where Clause for MovimientoInventario
        const where = {
            materialId: id,
        };
        if (options?.tipo && options.tipo !== 'todos' && options.tipo !== 'all') {
            where.tipo = options.tipo.toLowerCase();
        }
        if (options?.fechaInicio || options?.fechaFin) {
            const fechaFilter = {};
            if (options.fechaInicio) {
                const start = new Date(options.fechaInicio + 'T00:00:00');
                if (!Number.isNaN(start.getTime()))
                    fechaFilter.gte = start;
            }
            if (options.fechaFin) {
                const end = new Date(options.fechaFin + 'T23:59:59.999');
                if (!Number.isNaN(end.getTime()))
                    fechaFilter.lte = end;
            }
            if (Object.keys(fechaFilter).length > 0) {
                where.fecha = fechaFilter;
            }
        }
        if (options?.usuario?.trim()) {
            const searchUser = options.usuario.trim();
            const matchedUsers = await this.prisma.user.findMany({
                where: {
                    OR: [
                        { nombre: { contains: searchUser, mode: 'insensitive' } },
                        { username: { contains: searchUser, mode: 'insensitive' } },
                    ],
                },
                select: { id: true },
            });
            const userIds = matchedUsers.map(u => u.id);
            where.userId = { in: userIds };
        }
        // Pagination
        const page = Math.max(1, Number(options?.page) || 1);
        const limit = Math.max(1, Number(options?.limit) || 15);
        const skip = (page - 1) * limit;
        const [movimientosDb, total] = await Promise.all([
            this.prisma.movimientoInventario.findMany({
                where,
                orderBy: { fecha: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.movimientoInventario.count({ where }),
        ]);
        // Fetch user details for distinct userIds
        const distinctUserIds = Array.from(new Set(movimientosDb.map(m => m.userId).filter(Boolean)));
        const users = distinctUserIds.length > 0
            ? await this.prisma.user.findMany({
                where: { id: { in: distinctUserIds } },
                select: { id: true, nombre: true, username: true, rol: true },
            })
            : [];
        const userMap = new Map(users.map(u => [u.id, u]));
        const movimientos = movimientosDb.map(m => ({
            id: m.id,
            tipo: m.tipo,
            cantidad: m.cantidad,
            motivo: m.motivo,
            fecha: m.fecha ? new Date(m.fecha).toISOString() : '',
            userId: m.userId,
            usuario: m.userId ? userMap.get(m.userId) || null : null,
        }));
        return {
            material: {
                id: material.id,
                nombre: material.nombre,
                codigo: material.codigo,
                categoria: material.categoria,
                tipo: material.tipo,
                stockActual: material.stockActual,
                stockMinimo: material.stockMinimo,
                precioCosto: material.precioCosto,
                marca: material.marca,
                modelo: material.modelo,
                serie: material.serie,
                unidadMedida: material.unidadMedida ? {
                    id: material.unidadMedida.id,
                    nombre: material.unidadMedida.nombre,
                    abreviacion: material.unidadMedida.abreviacion
                } : { id: '', nombre: 'unidades', abreviacion: 'unid' }
            },
            movimientos,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
            }
        };
    }
}
