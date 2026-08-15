import { prisma } from '../../../../../config/prismaClient.js';
async function nextVehiculoId() {
    const rows = await prisma.vehiculo.findMany({ select: { id: true } });
    const max = rows.reduce((m, r) => {
        const match = String(r.id).match(/^VEH-(\d+)$/);
        if (match) {
            const n = parseInt(match[1], 10);
            return Number.isFinite(n) && n > m ? n : m;
        }
        return m;
    }, 0);
    return `VEH-${String(max + 1).padStart(3, '0')}`;
}
async function nextGastoId() {
    const rows = await prisma.gasto.findMany({ select: { id: true } });
    const max = rows.reduce((m, r) => {
        const match = String(r.id).match(/^GTO-(\d+)$/);
        if (match) {
            const n = parseInt(match[1], 10);
            return Number.isFinite(n) && n > m ? n : m;
        }
        return m;
    }, 0);
    return `GTO-${String(max + 1).padStart(3, '0')}`;
}
export class VehiculosController {
    // --- VEHÍCULOS ---
    async listVehiculos(_req, res) {
        try {
            const vehiculos = await prisma.vehiculo.findMany({
                include: {
                    mantenimientos: {
                        include: {
                            gasto: {
                                include: {
                                    metodoPago: true,
                                    registradoPor: { select: { id: true, nombre: true } }
                                }
                            }
                        },
                        orderBy: { fechaRealizado: 'desc' },
                    },
                },
                orderBy: { id: 'asc' },
            });
            return res.status(200).json({ success: true, data: vehiculos });
        }
        catch (error) {
            console.error('[vehiculos/list]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener vehículos' } });
        }
    }
    async getVehiculo(req, res) {
        try {
            const { id } = req.params;
            const vehiculo = await prisma.vehiculo.findUnique({
                where: { id: String(id) },
                include: {
                    mantenimientos: {
                        include: {
                            gasto: {
                                include: {
                                    metodoPago: true,
                                    registradoPor: { select: { id: true, nombre: true } }
                                }
                            }
                        },
                        orderBy: { fechaRealizado: 'desc' },
                    },
                },
            });
            if (!vehiculo) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehículo no encontrado' } });
            }
            return res.status(200).json({ success: true, data: vehiculo });
        }
        catch (error) {
            console.error('[vehiculos/get]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener detalles del vehículo' } });
        }
    }
    async createVehiculo(req, res) {
        try {
            const b = req.body || {};
            if (!b.placa || !b.marca || !b.modelo) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Placa, marca y modelo son requeridos' } });
            }
            // Validar placa única
            const existente = await prisma.vehiculo.findUnique({ where: { placa: b.placa } });
            if (existente) {
                return res.status(400).json({ success: false, error: { code: 'DUPLICATE_PLACA', message: 'La placa ya está registrada' } });
            }
            const id = await nextVehiculoId();
            const vehiculo = await prisma.vehiculo.create({
                data: {
                    id,
                    placa: b.placa,
                    marca: b.marca,
                    modelo: b.modelo,
                    anio: b.anio ? Number(b.anio) : null,
                    color: b.color ?? '',
                    kilometraje: b.kilometraje ? Number(b.kilometraje) : 0,
                    responsable: b.responsable ?? '',
                    notas: b.notas ?? '',
                    estado: b.estado ?? 'activo',
                },
            });
            return res.status(201).json({ success: true, data: vehiculo });
        }
        catch (error) {
            console.error('[vehiculos/create]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar vehículo' } });
        }
    }
    async updateVehiculo(req, res) {
        try {
            const { id } = req.params;
            const b = req.body || {};
            if (!b.placa || !b.marca || !b.modelo) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Placa, marca y modelo son requeridos' } });
            }
            // Validar placa única para otros vehículos
            const existente = await prisma.vehiculo.findFirst({
                where: {
                    placa: b.placa,
                    id: { not: String(id) },
                },
            });
            if (existente) {
                return res.status(400).json({ success: false, error: { code: 'DUPLICATE_PLACA', message: 'La placa ya está registrada por otro vehículo' } });
            }
            const vehiculo = await prisma.vehiculo.update({
                where: { id: String(id) },
                data: {
                    placa: b.placa,
                    marca: b.marca,
                    modelo: b.modelo,
                    anio: b.anio ? Number(b.anio) : null,
                    color: b.color ?? '',
                    kilometraje: b.kilometraje ? Number(b.kilometraje) : 0,
                    responsable: b.responsable ?? '',
                    notas: b.notas ?? '',
                    estado: b.estado ?? 'activo',
                },
            });
            return res.status(200).json({ success: true, data: vehiculo });
        }
        catch (error) {
            console.error('[vehiculos/update]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar vehículo' } });
        }
    }
    async removeVehiculo(req, res) {
        try {
            const { id } = req.params;
            // Obtener mantenimientos para limpiar gastos relacionados
            const mantenimientos = await prisma.vehiculoMantenimiento.findMany({
                where: { vehiculoId: String(id) },
                select: { gastoId: true },
            });
            const gastoIds = mantenimientos.map(m => m.gastoId).filter(Boolean);
            // Eliminar gastos asociados primero
            if (gastoIds.length > 0) {
                await prisma.gasto.deleteMany({
                    where: { id: { in: gastoIds } },
                });
            }
            // Eliminar vehículo (cascada elimina mantenimientos automáticamente)
            await prisma.vehiculo.delete({
                where: { id: String(id) },
            });
            return res.status(200).json({ success: true, data: { id } });
        }
        catch (error) {
            console.error('[vehiculos/remove]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar vehículo' } });
        }
    }
    // --- MANTENIMIENTOS ---
    async createMantenimiento(req, res) {
        try {
            const { id: vehiculoId } = req.params; // ID del vehículo
            const b = req.body || {};
            if (!b.tipo || !b.fechaRealizado || b.monto === undefined) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tipo, fecha realizado y monto son requeridos' } });
            }
            const vehiculo = await prisma.vehiculo.findUnique({
                where: { id: String(vehiculoId) },
            });
            if (!vehiculo) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehículo no encontrado' } });
            }
            // 1. Crear Gasto asociado
            const gastoId = await nextGastoId();
            const registradoPorUserId = req.user?.id || null;
            await prisma.gasto.create({
                data: {
                    id: gastoId,
                    concepto: `Mantenimiento Vehículo: Placa ${vehiculo.placa} (${b.tipo})`,
                    categoria: 'vehiculos',
                    fecha: new Date(b.fechaRealizado),
                    monto: Number(b.monto),
                    proveedor: b.proveedor ?? '',
                    notas: b.notas ?? '',
                    metodoPagoId: b.metodoPagoId || null,
                    registradoPorUserId: registradoPorUserId ?? undefined,
                },
            });
            // 2. Crear Mantenimiento
            const mantenimiento = await prisma.vehiculoMantenimiento.create({
                data: {
                    vehiculoId: String(vehiculoId),
                    tipo: b.tipo,
                    descripcion: b.descripcion ?? '',
                    fechaRealizado: new Date(b.fechaRealizado),
                    fechaProxima: b.fechaProxima ? new Date(b.fechaProxima) : null,
                    kilometraje: b.kilometraje ? Number(b.kilometraje) : null,
                    kmProximo: b.kmProximo ? Number(b.kmProximo) : null,
                    monto: Number(b.monto),
                    proveedor: b.proveedor ?? '',
                    notas: b.notas ?? '',
                    gastoId,
                },
            });
            // 3. Si el kilometraje reportado es mayor, actualizar el kilometraje del vehículo
            if (b.kilometraje && Number(b.kilometraje) > vehiculo.kilometraje) {
                await prisma.vehiculo.update({
                    where: { id: String(vehiculoId) },
                    data: { kilometraje: Number(b.kilometraje) },
                });
            }
            return res.status(201).json({ success: true, data: mantenimiento });
        }
        catch (error) {
            console.error('[mantenimientos/create]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar mantenimiento' } });
        }
    }
    async updateMantenimiento(req, res) {
        try {
            const { mantenimientoId } = req.params;
            const b = req.body || {};
            if (!b.tipo || !b.fechaRealizado || b.monto === undefined) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tipo, fecha realizado y monto son requeridos' } });
            }
            const mantenimiento = await prisma.vehiculoMantenimiento.findUnique({
                where: { id: String(mantenimientoId) },
                include: { vehiculo: true },
            });
            if (!mantenimiento) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mantenimiento no encontrado' } });
            }
            // 1. Actualizar Gasto asociado
            if (mantenimiento.gastoId) {
                await prisma.gasto.update({
                    where: { id: mantenimiento.gastoId },
                    data: {
                        concepto: `Mantenimiento Vehículo: Placa ${mantenimiento.vehiculo.placa} (${b.tipo})`,
                        fecha: new Date(b.fechaRealizado),
                        monto: Number(b.monto),
                        proveedor: b.proveedor ?? '',
                        notas: b.notas ?? '',
                        metodoPagoId: b.metodoPagoId || null,
                    },
                });
            }
            // 2. Actualizar Mantenimiento
            const actualizado = await prisma.vehiculoMantenimiento.update({
                where: { id: String(mantenimientoId) },
                data: {
                    tipo: b.tipo,
                    descripcion: b.descripcion ?? '',
                    fechaRealizado: new Date(b.fechaRealizado),
                    fechaProxima: b.fechaProxima ? new Date(b.fechaProxima) : null,
                    kilometraje: b.kilometraje ? Number(b.kilometraje) : null,
                    kmProximo: b.kmProximo ? Number(b.kmProximo) : null,
                    monto: Number(b.monto),
                    proveedor: b.proveedor ?? '',
                    notas: b.notas ?? '',
                },
            });
            // 3. Si el kilometraje reportado es mayor, actualizar el kilometraje del vehículo
            if (b.kilometraje && Number(b.kilometraje) > mantenimiento.vehiculo.kilometraje) {
                await prisma.vehiculo.update({
                    where: { id: maintenance_get_vehiculo_id_helper(mantenimiento) },
                    data: { kilometraje: Number(b.kilometraje) },
                });
            }
            return res.status(200).json({ success: true, data: actualizado });
        }
        catch (error) {
            console.error('[mantenimientos/update]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar mantenimiento' } });
        }
    }
    async removeMantenimiento(req, res) {
        try {
            const { mantenimientoId } = req.params;
            const mantenimiento = await prisma.vehiculoMantenimiento.findUnique({
                where: { id: String(mantenimientoId) },
            });
            if (!mantenimiento) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mantenimiento no encontrado' } });
            }
            // Al eliminar el gasto, el mantenimiento se eliminará automáticamente en cascada debido a onDelete: Cascade
            if (mantenimiento.gastoId) {
                await prisma.gasto.delete({
                    where: { id: mantenimiento.gastoId },
                });
            }
            else {
                await prisma.vehiculoMantenimiento.delete({
                    where: { id: String(mantenimientoId) },
                });
            }
            return res.status(200).json({ success: true, data: { id: mantenimientoId } });
        }
        catch (error) {
            console.error('[mantenimientos/remove]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar mantenimiento' } });
        }
    }
    // --- CONTROLES DE VEHÍCULO ───────────────────────────────────────────────
    async uploadControlFoto(req, res) {
        try {
            const file = req.file;
            if (!file) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No se envió ninguna foto' } });
            }
            const url = `/uploads/vehiculos/controles/${file.filename}`;
            return res.status(200).json({ success: true, data: { url } });
        }
        catch (error) {
            console.error('[controles/uploadFoto]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al subir foto de control' } });
        }
    }
    async listControles(req, res) {
        try {
            const { id: vehiculoId } = req.params;
            const controles = await prisma.vehiculoControl.findMany({
                where: { vehiculoId: String(vehiculoId) },
                orderBy: { fecha: 'desc' },
            });
            return res.status(200).json({ success: true, data: controles });
        }
        catch (error) {
            console.error('[controles/list]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener controles de vehículo' } });
        }
    }
    async createControl(req, res) {
        try {
            const { id: vehiculoId } = req.params;
            const b = req.body || {};
            if (b.kilometraje === undefined || !b.combustible) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Kilometraje y nivel de combustible son requeridos' } });
            }
            const vehiculo = await prisma.vehiculo.findUnique({
                where: { id: String(vehiculoId) },
            });
            if (!vehiculo) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehículo no encontrado' } });
            }
            const usuarioId = req.user?.id || null;
            // Look up real user name from DB since JWT doesn't include nombre
            let usuarioNom = 'Usuario';
            if (usuarioId) {
                const userRecord = await prisma.user.findUnique({
                    where: { id: String(usuarioId) },
                    select: { nombre: true },
                });
                if (userRecord?.nombre)
                    usuarioNom = userRecord.nombre;
            }
            const parseFechaControl = (val) => {
                if (!val)
                    return new Date();
                const str = String(val);
                if (str.includes('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
                    return new Date(str);
                }
                return new Date(`${str}:00.000-05:00`);
            };
            const control = await prisma.vehiculoControl.create({
                data: {
                    vehiculoId: String(vehiculoId),
                    usuarioId,
                    usuarioNom,
                    fecha: parseFechaControl(b.fecha),
                    kilometraje: Number(b.kilometraje),
                    combustible: String(b.combustible),
                    nivelAceite: Boolean(b.nivelAceite),
                    nivelAgua: Boolean(b.nivelAgua),
                    aceiteHidraulico: Boolean(b.aceiteHidraulico),
                    liquidoFrenos: Boolean(b.liquidoFrenos),
                    gataLlave: Boolean(b.gataLlave),
                    extintorBotiquin: Boolean(b.extintorBotiquin),
                    bandas: Boolean(b.bandas),
                    otroCheckNombre: String(b.otroCheckNombre ?? ''),
                    otroCheckValor: Boolean(b.otroCheckValor),
                    fotoGasolinaInicio: b.fotoGasolinaInicio ? String(b.fotoGasolinaInicio) : null,
                    fotoKmInicio: b.fotoKmInicio ? String(b.fotoKmInicio) : null,
                    fotoKmFin: b.fotoKmFin ? String(b.fotoKmFin) : null,
                    fotoGasolinaFin: b.fotoGasolinaFin ? String(b.fotoGasolinaFin) : null,
                    observacion: String(b.observacion ?? ''),
                    sugerencia: String(b.sugerencia ?? ''),
                },
            });
            // Actualizar kilometraje del vehículo si el reportado es mayor
            if (Number(b.kilometraje) > vehiculo.kilometraje) {
                await prisma.vehiculo.update({
                    where: { id: String(vehiculoId) },
                    data: { kilometraje: Number(b.kilometraje) },
                });
            }
            return res.status(201).json({ success: true, data: control });
        }
        catch (error) {
            console.error('[controles/create]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar control de vehículo' } });
        }
    }
    async updateControl(req, res) {
        try {
            const { controlId } = req.params;
            const b = req.body || {};
            const existing = await prisma.vehiculoControl.findUnique({
                where: { id: String(controlId) },
            });
            if (!existing) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Control no encontrado' } });
            }
            const parseFechaControl = (val) => {
                if (!val)
                    return existing.fecha;
                const str = String(val);
                if (str.includes('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
                    return new Date(str);
                }
                return new Date(`${str}:00.000-05:00`);
            };
            const updateData = {};
            if (b.fecha !== undefined)
                updateData.fecha = parseFechaControl(b.fecha);
            if (b.kilometraje !== undefined)
                updateData.kilometraje = Number(b.kilometraje);
            if (b.combustible !== undefined)
                updateData.combustible = String(b.combustible);
            if (b.nivelAceite !== undefined)
                updateData.nivelAceite = Boolean(b.nivelAceite);
            if (b.nivelAgua !== undefined)
                updateData.nivelAgua = Boolean(b.nivelAgua);
            if (b.aceiteHidraulico !== undefined)
                updateData.aceiteHidraulico = Boolean(b.aceiteHidraulico);
            if (b.liquidoFrenos !== undefined)
                updateData.liquidoFrenos = Boolean(b.liquidoFrenos);
            if (b.gataLlave !== undefined)
                updateData.gataLlave = Boolean(b.gataLlave);
            if (b.extintorBotiquin !== undefined)
                updateData.extintorBotiquin = Boolean(b.extintorBotiquin);
            if (b.bandas !== undefined)
                updateData.bandas = Boolean(b.bandas);
            if (b.otroCheckNombre !== undefined)
                updateData.otroCheckNombre = String(b.otroCheckNombre ?? '');
            if (b.otroCheckValor !== undefined)
                updateData.otroCheckValor = Boolean(b.otroCheckValor);
            if (b.observacion !== undefined)
                updateData.observacion = String(b.observacion ?? '');
            if (b.sugerencia !== undefined)
                updateData.sugerencia = String(b.sugerencia ?? '');
            if (b.fotoGasolinaInicio !== undefined)
                updateData.fotoGasolinaInicio = b.fotoGasolinaInicio ? String(b.fotoGasolinaInicio) : null;
            if (b.fotoKmInicio !== undefined)
                updateData.fotoKmInicio = b.fotoKmInicio ? String(b.fotoKmInicio) : null;
            if (b.fotoKmFin !== undefined)
                updateData.fotoKmFin = b.fotoKmFin ? String(b.fotoKmFin) : null;
            if (b.fotoGasolinaFin !== undefined)
                updateData.fotoGasolinaFin = b.fotoGasolinaFin ? String(b.fotoGasolinaFin) : null;
            const updated = await prisma.vehiculoControl.update({
                where: { id: String(controlId) },
                data: updateData,
            });
            // Si el kilometraje actualizado es mayor al actual del vehículo, actualizarlo
            if (b.kilometraje && Number(b.kilometraje) > 0) {
                const vehiculo = await prisma.vehiculo.findUnique({ where: { id: existing.vehiculoId } });
                if (vehiculo && Number(b.kilometraje) > vehiculo.kilometraje) {
                    await prisma.vehiculo.update({
                        where: { id: existing.vehiculoId },
                        data: { kilometraje: Number(b.kilometraje) },
                    });
                }
            }
            return res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('[controles/update]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar control de vehículo' } });
        }
    }
    async removeControl(req, res) {
        try {
            const { controlId } = req.params;
            const user = req.user;
            const rol = (user?.rol || '').toLowerCase().trim();
            const username = (user?.username || '').toLowerCase().trim();
            const isAdmin = rol === 'admin' || rol === 'administrador' || username === 'admin';
            if (!isAdmin) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden eliminar controles de vehículos' } });
            }
            const existing = await prisma.vehiculoControl.findUnique({
                where: { id: String(controlId) },
            });
            if (!existing) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Control no encontrado' } });
            }
            await prisma.vehiculoControl.delete({
                where: { id: String(controlId) },
            });
            return res.status(200).json({ success: true, data: { id: controlId } });
        }
        catch (error) {
            console.error('[controles/remove]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar control de vehículo' } });
        }
    }
}
function maintenance_get_vehiculo_id_helper(m) {
    return m.vehiculoId || m.vehiculo?.id;
}
