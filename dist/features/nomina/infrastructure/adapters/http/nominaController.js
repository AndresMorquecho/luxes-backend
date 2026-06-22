import ExcelJS from 'exceljs';
import { prisma } from '../../../../../config/prismaClient.js';
export class NominaController {
    // ─── Horas Extras (Overtime) Endpoints ───
    async getOvertime(req, res) {
        try {
            const { fechaInicio, fechaFin } = req.query;
            if (!fechaInicio || !fechaFin) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'fechaInicio y fechaFin son requeridos' }
                });
            }
            const records = await prisma.horaExtra.findMany({
                where: {
                    fecha: {
                        gte: new Date(String(fechaInicio)),
                        lte: new Date(String(fechaFin)),
                    }
                },
                orderBy: { fecha: 'asc' }
            });
            // Map decimal fields to number to avoid JSON big decimal issue
            const formatted = records.map(r => ({
                id: r.id,
                fecha: r.fecha.toISOString().split('T')[0],
                colaboradorId: r.colaboradorId,
                horas: Number(r.horas),
                detalleHorario: r.detalleHorario,
                descripcion: r.descripcion,
                valorPorHora: Number(r.valorPorHora),
                total: Number(r.total),
                estado: r.estado
            }));
            return res.status(200).json({
                success: true,
                data: formatted
            });
        }
        catch (error) {
            console.error('[nomina/getOvertime]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener horas extras' }
            });
        }
    }
    async saveOvertimeBulk(req, res) {
        try {
            const { horasExtras, fechaInicio, fechaFin } = req.body;
            if (!Array.isArray(horasExtras)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'horasExtras debe ser un arreglo' }
                });
            }
            // Upsert all received records
            const saved = [];
            const receivedIds = [];
            for (const r of horasExtras) {
                const total = Number(r.horas) * Number(r.valorPorHora);
                const recordId = r.id && String(r.id).length > 5 && !String(r.id).includes('.') ? String(r.id) : undefined;
                const upserted = await prisma.horaExtra.upsert({
                    where: { id: recordId || 'dummy-uuid-to-force-create' },
                    update: {
                        fecha: new Date(r.fecha),
                        colaboradorId: String(r.colaboradorId),
                        horas: Number(r.horas),
                        detalleHorario: r.detalleHorario || '',
                        descripcion: r.descripcion || '',
                        valorPorHora: Number(r.valorPorHora),
                        total: total,
                        estado: r.estado || 'DEUDOR',
                    },
                    create: {
                        id: recordId,
                        fecha: new Date(r.fecha),
                        colaboradorId: String(r.colaboradorId),
                        horas: Number(r.horas),
                        detalleHorario: r.detalleHorario || '',
                        descripcion: r.descripcion || '',
                        valorPorHora: Number(r.valorPorHora),
                        total: total,
                        estado: r.estado || 'DEUDOR',
                    }
                });
                receivedIds.push(upserted.id);
                saved.push({
                    id: upserted.id,
                    fecha: upserted.fecha.toISOString().split('T')[0],
                    colaboradorId: upserted.colaboradorId,
                    horas: Number(upserted.horas),
                    detalleHorario: upserted.detalleHorario,
                    descripcion: upserted.descripcion,
                    valorPorHora: Number(upserted.valorPorHora),
                    total: Number(upserted.total),
                    estado: upserted.estado
                });
            }
            // If range is provided, delete records in the range that are NOT in the receivedIds list
            if (fechaInicio && fechaFin) {
                await prisma.horaExtra.deleteMany({
                    where: {
                        fecha: {
                            gte: new Date(String(fechaInicio)),
                            lte: new Date(String(fechaFin))
                        },
                        id: {
                            notIn: receivedIds
                        }
                    }
                });
            }
            return res.status(200).json({
                success: true,
                data: saved
            });
        }
        catch (error) {
            console.error('[nomina/saveOvertimeBulk]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al guardar horas extras' }
            });
        }
    }
    // ─── Nómina Endpoints ───
    async getPayrolls(req, res) {
        try {
            const { fechaInicio, fechaFin } = req.query;
            if (!fechaInicio || !fechaFin) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'fechaInicio y fechaFin son requeridos' }
                });
            }
            const fInicio = new Date(String(fechaInicio));
            const fFin = new Date(String(fechaFin));
            let records = await prisma.nominaRegistro.findMany({
                where: {
                    fechaInicio: fInicio,
                    fechaFin: fFin
                }
            });
            const empleados = await prisma.empleado.findMany();
            const empleadoIds = empleados.map(e => e.id);
            const diffDias = Math.floor((fFin.getTime() - fInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            // Pre-fetch related records in batch to avoid N+1 queries
            const asistenciasBatch = await prisma.asistencia.findMany({
                where: {
                    empleadoId: { in: empleadoIds },
                    fechaHora: { gte: fInicio, lte: fFin }
                },
                select: {
                    empleadoId: true,
                    fechaHora: true
                }
            });
            const horasExtrasBatch = await prisma.horaExtra.findMany({
                where: {
                    colaboradorId: { in: empleadoIds },
                    fecha: { gte: fInicio, lte: fFin }
                }
            });
            const ingresosBatch = await prisma.ingresoDetalle.findMany({
                where: {
                    empleadoId: { in: empleadoIds },
                    fecha: { gte: fInicio, lte: fFin }
                }
            });
            const egresosBatch = await prisma.egreso.findMany({
                where: {
                    empleadoId: { in: empleadoIds },
                    fecha: { gte: fInicio, lte: fFin }
                }
            });
            // Group records by employee ID for O(1) retrieval
            const asistenciasByEmpleado = new Map();
            for (const a of asistenciasBatch) {
                if (!asistenciasByEmpleado.has(a.empleadoId)) {
                    asistenciasByEmpleado.set(a.empleadoId, []);
                }
                asistenciasByEmpleado.get(a.empleadoId).push(a.fechaHora);
            }
            const horasExtrasByEmpleado = new Map();
            for (const h of horasExtrasBatch) {
                if (!horasExtrasByEmpleado.has(h.colaboradorId)) {
                    horasExtrasByEmpleado.set(h.colaboradorId, []);
                }
                horasExtrasByEmpleado.get(h.colaboradorId).push(h);
            }
            const ingresosByEmpleado = new Map();
            for (const i of ingresosBatch) {
                if (!ingresosByEmpleado.has(i.empleadoId)) {
                    ingresosByEmpleado.set(i.empleadoId, []);
                }
                ingresosByEmpleado.get(i.empleadoId).push(i);
            }
            const egresosByEmpleado = new Map();
            for (const e of egresosBatch) {
                if (!egresosByEmpleado.has(e.empleadoId)) {
                    egresosByEmpleado.set(e.empleadoId, []);
                }
                egresosByEmpleado.get(e.empleadoId).push(e);
            }
            const recordsMap = new Map(records.map(r => [r.empleadoId, r]));
            const transactionOperations = [];
            const userIndexInTransaction = new Map();
            for (const emp of empleados) {
                const empAsistencias = asistenciasByEmpleado.get(emp.id) || [];
                // Contar días únicos con asistencia
                const uniqueDays = new Set(empAsistencias.map(fechaHora => {
                    const d = new Date(fechaHora);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                })).size;
                const hasContract = emp.tieneContrato !== false;
                const diasTrabajados = uniqueDays;
                const defaultSueldoBruto = Number(emp.sueldoDiario) * diasTrabajados;
                const decimoCuartoVal = 0;
                const decimoTerceroVal = hasContract ? Math.round((defaultSueldoBruto / 12) * 100) / 100 : 0;
                const iessVal = hasContract ? Math.round((defaultSueldoBruto * 0.0945) * 100) / 100 : 0;
                const empHorasExtras = horasExtrasByEmpleado.get(emp.id) || [];
                const horasExtrasSum = empHorasExtras.reduce((s, h) => s + Number(h.total), 0);
                const empIngresos = ingresosByEmpleado.get(emp.id) || [];
                let trabEmpSum = 0;
                let otrosIngresosSum = 0;
                for (const i of empIngresos) {
                    const mVal = Number(i.monto);
                    if (i.tipo === 'TRAB_EMP')
                        trabEmpSum += mVal;
                    else if (i.tipo === 'OTROS')
                        otrosIngresosSum += mVal;
                }
                const empEgresos = egresosByEmpleado.get(emp.id) || [];
                let anticiposSum = 0;
                let multasSum = 0;
                let otrosSum = 0;
                for (const e of empEgresos) {
                    const mVal = Number(e.monto);
                    if (e.tipo === 'ANTICIPO')
                        anticiposSum += mVal;
                    else if (e.tipo === 'MULTA')
                        multasSum += mVal;
                    else if (e.tipo === 'OTROS')
                        otrosSum += mVal;
                }
                const existing = recordsMap.get(emp.id);
                if (!existing) {
                    userIndexInTransaction.set(emp.id, transactionOperations.length);
                    transactionOperations.push(prisma.nominaRegistro.create({
                        data: {
                            empleadoId: emp.id,
                            fechaInicio: fInicio,
                            fechaFin: fFin,
                            diasLaborables: diffDias,
                            diasLaborados: diasTrabajados,
                            permisoHoras: 0,
                            ingresos: {
                                decimoCuarto: decimoCuartoVal,
                                decimoTercero: decimoTerceroVal,
                                horasExtras: horasExtrasSum,
                                trabajosEnEmpresa: trabEmpSum,
                                fondosReserva: 0,
                            },
                            egresos: {
                                iess: iessVal,
                                extensionConyuge: 0,
                                prestamoQuirografario: 0,
                                anticipos: anticiposSum,
                                dctoHorasNoLaboradas: 0,
                                multas: multasSum,
                                dctoFiesta: 0,
                                dctoHerramientas: 0,
                                dctoGenerico: otrosSum,
                            },
                            abonos: [],
                            estado: "PENDIENTE"
                        }
                    }));
                }
                else {
                    // Si existe y no está completamente liquidado/pagado, actualizamos diasLaborados e IESS/Décimos por si hay nuevas marcaciones QR
                    if (existing.estado === "PENDIENTE" || existing.estado === "ABONO_PARCIAL") {
                        const currentIngresos = existing.ingresos || {};
                        const currentEgresos = existing.egresos || {};
                        const updatedIngresos = { ...currentIngresos };
                        const updatedEgresos = { ...currentEgresos };
                        if (!hasContract) {
                            updatedIngresos.decimoCuarto = 0;
                            updatedIngresos.decimoTercero = 0;
                            updatedIngresos.fondosReserva = 0;
                            updatedEgresos.iess = 0;
                        }
                        else {
                            // Si tiene contrato, recalculamos IESS y décimo tercero para mantener coherencia
                            // con los días trabajados. El décimo cuarto NO se recalcula: es un abono manual que
                            // se ingresa de poco a poco en cualquier quincena, por lo que se preserva el valor guardado.
                            updatedIngresos.decimoTercero = decimoTerceroVal;
                            updatedEgresos.iess = iessVal;
                        }
                        // Sincronizamos las horas extras y trabajos empresa:
                        updatedIngresos.horasExtras = horasExtrasSum;
                        updatedIngresos.trabajosEnEmpresa = trabEmpSum;
                        // Sincronizamos los egresos detallados:
                        updatedEgresos.anticipos = anticiposSum;
                        updatedEgresos.multas = multasSum;
                        updatedEgresos.dctoGenerico = otrosSum;
                        userIndexInTransaction.set(emp.id, transactionOperations.length);
                        transactionOperations.push(prisma.nominaRegistro.update({
                            where: { id: existing.id },
                            data: {
                                diasLaborados: diasTrabajados,
                                ingresos: updatedIngresos,
                                egresos: updatedEgresos,
                            }
                        }));
                    }
                }
            }
            // Execute all write operations in a single atomic database transaction
            let transactionResults = [];
            if (transactionOperations.length > 0) {
                transactionResults = await prisma.$transaction(transactionOperations);
            }
            const updatedRecords = [];
            for (const emp of empleados) {
                const existing = recordsMap.get(emp.id);
                const txIndex = userIndexInTransaction.get(emp.id);
                if (txIndex !== undefined) {
                    updatedRecords.push(transactionResults[txIndex]);
                }
                else {
                    updatedRecords.push(existing);
                }
            }
            records = updatedRecords;
            // Convert decimal/Json fields to clean JS representation
            const formatted = records.map(r => ({
                id: r.id,
                empleadoId: r.empleadoId,
                fechaInicio: r.fechaInicio.toISOString().split('T')[0],
                fechaFin: r.fechaFin.toISOString().split('T')[0],
                diasLaborables: Number(r.diasLaborables),
                diasLaborados: Number(r.diasLaborados),
                permisoHoras: Number(r.permisoHoras),
                ingresos: r.ingresos || {},
                egresos: r.egresos || {},
                abonos: r.abonos || [],
                estado: r.estado || 'PENDIENTE'
            }));
            return res.status(200).json({
                success: true,
                data: formatted
            });
        }
        catch (error) {
            console.error('[nomina/getPayrolls]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener registros de nómina' }
            });
        }
    }
    async savePayroll(req, res) {
        try {
            const data = req.body;
            if (!data.empleadoId || !data.fechaInicio || !data.fechaFin) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'empleadoId, fechaInicio y fechaFin son requeridos' }
                });
            }
            const updated = await prisma.nominaRegistro.upsert({
                where: {
                    empleadoId_fechaInicio_fechaFin: {
                        empleadoId: String(data.empleadoId),
                        fechaInicio: new Date(data.fechaInicio),
                        fechaFin: new Date(data.fechaFin),
                    }
                },
                update: {
                    diasLaborables: Number(data.diasLaborables),
                    diasLaborados: Number(data.diasLaborados),
                    permisoHoras: Number(data.permisoHoras),
                    ingresos: data.ingresos || {},
                    egresos: data.egresos || {},
                    abonos: data.abonos || [],
                    estado: data.estado || "PENDIENTE",
                },
                create: {
                    empleadoId: String(data.empleadoId),
                    fechaInicio: new Date(data.fechaInicio),
                    fechaFin: new Date(data.fechaFin),
                    diasLaborables: Number(data.diasLaborables),
                    diasLaborados: Number(data.diasLaborados),
                    permisoHoras: Number(data.permisoHoras),
                    ingresos: data.ingresos || {},
                    egresos: data.egresos || {},
                    abonos: data.abonos || [],
                    estado: data.estado || "PENDIENTE",
                }
            });
            return res.status(200).json({
                success: true,
                data: {
                    id: updated.id,
                    empleadoId: updated.empleadoId,
                    fechaInicio: updated.fechaInicio.toISOString().split('T')[0],
                    fechaFin: updated.fechaFin.toISOString().split('T')[0],
                    diasLaborables: Number(updated.diasLaborables),
                    diasLaborados: Number(updated.diasLaborados),
                    permisoHoras: Number(updated.permisoHoras),
                    ingresos: updated.ingresos || {},
                    egresos: updated.egresos || {},
                    abonos: updated.abonos || [],
                    estado: updated.estado || 'PENDIENTE'
                }
            });
        }
        catch (error) {
            console.error('[nomina/savePayroll]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al guardar nómina' }
            });
        }
    }
    // ─── Vacaciones Endpoints ───
    async getVacaciones(req, res) {
        try {
            const records = await prisma.vacacion.findMany();
            const formatted = records.map(r => ({
                id: r.id,
                empleadoId: r.empleadoId,
                año: r.anio,
                diasTomados: r.diasTomados || []
            }));
            return res.status(200).json({
                success: true,
                data: formatted
            });
        }
        catch (error) {
            console.error('[nomina/getVacaciones]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener vacaciones' }
            });
        }
    }
    async saveVacacion(req, res) {
        try {
            const { empleadoId, año, diasTomados } = req.body;
            if (!empleadoId || año === undefined || !Array.isArray(diasTomados)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'empleadoId, año y diasTomados son requeridos' }
                });
            }
            const updated = await prisma.vacacion.upsert({
                where: {
                    empleadoId_anio: {
                        empleadoId: String(empleadoId),
                        anio: Number(año)
                    }
                },
                update: {
                    diasTomados: diasTomados
                },
                create: {
                    empleadoId: String(empleadoId),
                    anio: Number(año),
                    diasTomados: diasTomados
                }
            });
            return res.status(200).json({
                success: true,
                data: {
                    id: updated.id,
                    empleadoId: updated.empleadoId,
                    año: updated.anio,
                    diasTomados: updated.diasTomados
                }
            });
        }
        catch (error) {
            console.error('[nomina/saveVacacion]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al guardar vacaciones' }
            });
        }
    }
    // ─── Egresos Detallados Endpoints ───
    async getDetailedEgresos(req, res) {
        try {
            const { empleadoId, fechaInicio, fechaFin } = req.query;
            if (!empleadoId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'empleadoId es requerido' }
                });
            }
            const whereClause = { empleadoId: String(empleadoId) };
            if (fechaInicio && fechaFin) {
                whereClause.fecha = {
                    gte: new Date(String(fechaInicio)),
                    lte: new Date(String(fechaFin))
                };
            }
            const records = await prisma.egreso.findMany({
                where: whereClause,
                orderBy: { fecha: 'asc' }
            });
            const formatted = records.map(r => ({
                id: r.id,
                empleadoId: r.empleadoId,
                tipo: r.tipo,
                monto: Number(r.monto),
                fecha: r.fecha.toISOString().split('T')[0],
                motivo: r.motivo
            }));
            return res.status(200).json({
                success: true,
                data: formatted
            });
        }
        catch (error) {
            console.error('[nomina/getDetailedEgresos]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener egresos detallados' }
            });
        }
    }
    async createDetailedEgreso(req, res) {
        try {
            const { empleadoId, tipo, monto, fecha, motivo } = req.body;
            if (!empleadoId || !tipo || monto === undefined || !fecha) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'empleadoId, tipo, monto y fecha son requeridos' }
                });
            }
            if (!['ANTICIPO', 'MULTA', 'OTROS'].includes(tipo)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'tipo inválido (debe ser ANTICIPO, MULTA u OTROS)' }
                });
            }
            const newEgreso = await prisma.egreso.create({
                data: {
                    empleadoId: String(empleadoId),
                    tipo: String(tipo),
                    monto: Number(monto),
                    fecha: new Date(String(fecha)),
                    motivo: motivo || ''
                }
            });
            // Recalcular la nómina del período correspondiente para este empleado
            await this.recalculatePayrollForEgreso(String(empleadoId), new Date(String(fecha)));
            return res.status(201).json({
                success: true,
                data: {
                    id: newEgreso.id,
                    empleadoId: newEgreso.empleadoId,
                    tipo: newEgreso.tipo,
                    monto: Number(newEgreso.monto),
                    fecha: newEgreso.fecha.toISOString().split('T')[0],
                    motivo: newEgreso.motivo
                }
            });
        }
        catch (error) {
            console.error('[nomina/createDetailedEgreso]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al crear egreso detallado' }
            });
        }
    }
    async deleteDetailedEgreso(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'id es requerido' }
                });
            }
            const egreso = await prisma.egreso.findUnique({
                where: { id: String(id) }
            });
            if (!egreso) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Egreso no encontrado' }
                });
            }
            await prisma.egreso.delete({
                where: { id: String(id) }
            });
            // Recalcular la nómina del período correspondiente para este empleado
            await this.recalculatePayrollForEgreso(egreso.empleadoId, egreso.fecha);
            return res.status(200).json({
                success: true,
                message: 'Egreso eliminado correctamente'
            });
        }
        catch (error) {
            console.error('[nomina/deleteDetailedEgreso]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar egreso detallado' }
            });
        }
    }
    async recalculatePayrollForEgreso(empleadoId, fechaEgreso) {
        // Buscar la nómina que contenga la fecha del egreso para este empleado
        const payroll = await prisma.nominaRegistro.findFirst({
            where: {
                empleadoId,
                fechaInicio: { lte: fechaEgreso },
                fechaFin: { gte: fechaEgreso }
            }
        });
        if (payroll) {
            // Obtener todos los egresos del período de esta nómina
            const detailedEgresos = await prisma.egreso.findMany({
                where: {
                    empleadoId,
                    fecha: {
                        gte: payroll.fechaInicio,
                        lte: payroll.fechaFin
                    }
                }
            });
            let anticiposSum = 0;
            let multasSum = 0;
            let otrosSum = 0;
            for (const e of detailedEgresos) {
                const mVal = Number(e.monto);
                if (e.tipo === 'ANTICIPO')
                    anticiposSum += mVal;
                else if (e.tipo === 'MULTA')
                    multasSum += mVal;
                else if (e.tipo === 'OTROS')
                    otrosSum += mVal;
            }
            const currentEgresos = payroll.egresos || {};
            const updatedEgresos = {
                ...currentEgresos,
                anticipos: anticiposSum,
                multas: multasSum,
                dctoGenerico: otrosSum
            };
            await prisma.nominaRegistro.update({
                where: { id: payroll.id },
                data: {
                    egresos: updatedEgresos
                }
            });
        }
    }
    // ─── Ingresos Detallados CRUD ───
    async getDetailedIngresos(req, res) {
        try {
            const { empleadoId, fechaInicio, fechaFin } = req.query;
            const whereClause = {};
            if (empleadoId) {
                whereClause.empleadoId = String(empleadoId);
            }
            if (fechaInicio && fechaFin) {
                whereClause.fecha = {
                    gte: new Date(String(fechaInicio)),
                    lte: new Date(String(fechaFin))
                };
            }
            const records = await prisma.ingresoDetalle.findMany({
                where: whereClause,
                orderBy: { fecha: 'asc' }
            });
            const formatted = records.map(r => ({
                id: r.id,
                empleadoId: r.empleadoId,
                tipo: r.tipo,
                monto: Number(r.monto),
                fecha: r.fecha.toISOString().split('T')[0],
                motivo: r.motivo
            }));
            return res.status(200).json({
                success: true,
                data: formatted
            });
        }
        catch (error) {
            console.error('[nomina/getDetailedIngresos]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener ingresos detallados' }
            });
        }
    }
    async createDetailedIngreso(req, res) {
        try {
            const { empleadoId, tipo, monto, fecha, motivo } = req.body;
            if (!empleadoId || !tipo || monto === undefined || !fecha) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'empleadoId, tipo, monto y fecha son requeridos' }
                });
            }
            if (!['TRAB_EMP', 'OTROS'].includes(tipo)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'tipo inválido (debe ser TRAB_EMP u OTROS)' }
                });
            }
            const newIngreso = await prisma.ingresoDetalle.create({
                data: {
                    empleadoId: String(empleadoId),
                    tipo: String(tipo),
                    monto: Number(monto),
                    fecha: new Date(String(fecha)),
                    motivo: motivo || ''
                }
            });
            // Recalcular la nómina del período correspondiente para este empleado
            await this.recalculatePayrollForIngreso(String(empleadoId), new Date(String(fecha)));
            return res.status(201).json({
                success: true,
                data: {
                    id: newIngreso.id,
                    empleadoId: newIngreso.empleadoId,
                    tipo: newIngreso.tipo,
                    monto: Number(newIngreso.monto),
                    fecha: newIngreso.fecha.toISOString().split('T')[0],
                    motivo: newIngreso.motivo
                }
            });
        }
        catch (error) {
            console.error('[nomina/createDetailedIngreso]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al crear ingreso detallado' }
            });
        }
    }
    async deleteDetailedIngreso(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'id es requerido' }
                });
            }
            const ingreso = await prisma.ingresoDetalle.findUnique({
                where: { id: String(id) }
            });
            if (!ingreso) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Ingreso no encontrado' }
                });
            }
            await prisma.ingresoDetalle.delete({
                where: { id: String(id) }
            });
            // Recalcular la nómina del período correspondiente para este empleado
            await this.recalculatePayrollForIngreso(ingreso.empleadoId, ingreso.fecha);
            return res.status(200).json({
                success: true,
                message: 'Ingreso eliminado correctamente'
            });
        }
        catch (error) {
            console.error('[nomina/deleteDetailedIngreso]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar ingreso detallado' }
            });
        }
    }
    async recalculatePayrollForIngreso(empleadoId, fechaIngreso) {
        // Buscar la nómina que contenga la fecha del ingreso para este empleado
        const payroll = await prisma.nominaRegistro.findFirst({
            where: {
                empleadoId,
                fechaInicio: { lte: fechaIngreso },
                fechaFin: { gte: fechaIngreso }
            }
        });
        if (payroll) {
            // Obtener todos las horas extras del período de esta nómina
            const detailedHorasExtras = await prisma.horaExtra.findMany({
                where: {
                    colaboradorId: empleadoId,
                    fecha: {
                        gte: payroll.fechaInicio,
                        lte: payroll.fechaFin
                    }
                }
            });
            const horasExtrasSum = detailedHorasExtras.reduce((s, h) => s + Number(h.total), 0);
            // Obtener todos los ingresos detallados del período de esta nómina
            const detailedIngresos = await prisma.ingresoDetalle.findMany({
                where: {
                    empleadoId,
                    fecha: {
                        gte: payroll.fechaInicio,
                        lte: payroll.fechaFin
                    }
                }
            });
            let trabEmpSum = 0;
            for (const i of detailedIngresos) {
                const mVal = Number(i.monto);
                if (i.tipo === 'TRAB_EMP')
                    trabEmpSum += mVal;
            }
            const currentIngresos = payroll.ingresos || {};
            const updatedIngresos = {
                ...currentIngresos,
                horasExtras: horasExtrasSum,
                trabajosEnEmpresa: trabEmpSum
            };
            await prisma.nominaRegistro.update({
                where: { id: payroll.id },
                data: {
                    ingresos: updatedIngresos
                }
            });
        }
    }
    async exportToExcel(req, res) {
        try {
            const { year, month } = req.query;
            if (!year || !month) {
                res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'year y month son requeridos' }
                });
                return;
            }
            const yVal = Number(year);
            const mVal = Number(month);
            // Calcular fechas para Q1 (01 al 15)
            const q1Inicio = new Date(yVal, mVal - 1, 1);
            const q1Fin = new Date(yVal, mVal - 1, 15);
            // Calcular fechas para Q2 (16 al fin de mes)
            const q2Inicio = new Date(yVal, mVal - 1, 16);
            const q2Fin = new Date(yVal, mVal, 0); // último día del mes
            // Obtener colaboradores
            const empleados = await prisma.empleado.findMany({
                orderBy: { nombre: 'asc' }
            });
            // Obtener nóminas del período Q1 y Q2
            const nominasQ1 = await prisma.nominaRegistro.findMany({
                where: { fechaInicio: q1Inicio, fechaFin: q1Fin }
            });
            const nominasQ2 = await prisma.nominaRegistro.findMany({
                where: { fechaInicio: q2Inicio, fechaFin: q2Fin }
            });
            // Obtener todos los detalles de horas extras, ingresos, egresos del mes
            const detailedHorasExtras = await prisma.horaExtra.findMany({
                where: {
                    fecha: { gte: q1Inicio, lte: q2Fin }
                },
                orderBy: { fecha: 'asc' }
            });
            const detailedIngresos = await prisma.ingresoDetalle.findMany({
                where: { fecha: { gte: q1Inicio, lte: q2Fin } },
                orderBy: { fecha: 'asc' }
            });
            const detailedEgresos = await prisma.egreso.findMany({
                where: { fecha: { gte: q1Inicio, lte: q2Fin } },
                orderBy: { fecha: 'asc' }
            });
            // Helper para calcular la nómina a nivel de objeto para el Excel
            const mapNominaRow = (emp, rawNomina, quincenaNum, fInicio, fFin) => {
                const hasContract = emp.tieneContrato !== false;
                const sueldo = Number(emp.sueldoDiario);
                const diasT = rawNomina ? Number(rawNomina.diasLaborados) : 0;
                const totalB = rawNomina ? Number(rawNomina.totalBruto) : sueldo * diasT;
                // Décimo cuarto: abono manual que puede registrarse en cualquier quincena. Se usa el
                // valor guardado en la nómina (más abajo); por defecto 0 si no se ha abonado nada.
                const decimoCuartoVal = 0;
                const decimoTerceroVal = hasContract ? Math.round((totalB / 12) * 100) / 100 : 0;
                const iessVal = hasContract ? Math.round((totalB * 0.0945) * 100) / 100 : 0;
                const he = rawNomina?.ingresos?.horasExtras ? Number(rawNomina.ingresos.horasExtras) : 0;
                const te = rawNomina?.ingresos?.trabajosEnEmpresa ? Number(rawNomina.ingresos.trabajosEnEmpresa) : 0;
                const fr = rawNomina?.ingresos?.fondosReserva ? Number(rawNomina.ingresos.fondosReserva) : 0;
                const d3 = rawNomina?.ingresos?.decimoTercero ? Number(rawNomina.ingresos.decimoTercero) : decimoTerceroVal;
                const d4 = rawNomina?.ingresos?.decimoCuarto ? Number(rawNomina.ingresos.decimoCuarto) : decimoCuartoVal;
                const iess = rawNomina?.egresos?.iess ? Number(rawNomina.egresos.iess) : iessVal;
                const ant = rawNomina?.egresos?.anticipos ? Number(rawNomina.egresos.anticipos) : 0;
                const multas = rawNomina?.egresos?.multas ? Number(rawNomina.egresos.multas) : 0;
                const otrosE = rawNomina?.egresos?.dctoGenerico ? Number(rawNomina.egresos.dctoGenerico) : 0;
                const extConyuge = rawNomina?.egresos?.extensionConyuge ? Number(rawNomina.egresos.extensionConyuge) : 0;
                const quirografario = rawNomina?.egresos?.prestamoQuirografario ? Number(rawNomina.egresos.prestamoQuirografario) : 0;
                const dctoHoras = rawNomina?.egresos?.dctoHorasNoLaboradas ? Number(rawNomina.egresos.dctoHorasNoLaboradas) : 0;
                const dctoFiesta = rawNomina?.egresos?.dctoFiesta ? Number(rawNomina.egresos.dctoFiesta) : 0;
                const dctoHerramientas = rawNomina?.egresos?.dctoHerramientas ? Number(rawNomina.egresos.dctoHerramientas) : 0;
                const sumaIngresos = d3 + d4 + he + te + fr;
                const sumaEgresos = iess + ant + multas + otrosE + extConyuge + quirografario + dctoHoras + dctoFiesta + dctoHerramientas;
                const netoRecibir = (totalB + sumaIngresos) - sumaEgresos;
                const totalAbonado = rawNomina?.abonos ? rawNomina.abonos.reduce((sum, ab) => sum + Number(ab.monto), 0) : 0;
                const pendiente = Math.max(0, netoRecibir - totalAbonado);
                return {
                    nombre: emp.nombre,
                    contrato: hasContract ? 'CONTRATO' : 'POR ASIS',
                    diario: sueldo,
                    diasT,
                    sueldoB: totalB,
                    ingresosVar: he + te,
                    decimo3: d3,
                    decimo4: d4,
                    fRes: fr,
                    totalIngresos: sumaIngresos,
                    iess,
                    egresosVarios: ant + multas + otrosE,
                    totalEgresos: sumaEgresos,
                    neto: netoRecibir,
                    pagado: totalAbonado,
                    pendiente
                };
            };
            // Crear Workbook
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'LUXES Portal';
            workbook.created = new Date();
            const mesesNombres = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];
            const mesName = mesesNombres[mVal - 1];
            // Función para agregar una hoja de quincena
            const addQuincenaSheet = (sheetName, titleLabel, nominasList, quincenaNum, fInicio, fFin) => {
                const sheet = workbook.addWorksheet(sheetName);
                sheet.views = [{ showGridLines: true }];
                // Fila 1: Título
                sheet.mergeCells('A1:R1');
                const titleCell = sheet.getCell('A1');
                titleCell.value = titleLabel;
                titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1F4E78' } };
                titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
                sheet.getRow(1).height = 30;
                // Fila 2: Espacio en blanco
                sheet.getRow(2).height = 10;
                // Cabeceras de la tabla - Nivel 1 (Fila 3)
                const headerRow1Values = [
                    'Colaborador', '', '', // colSpan 3
                    'Sueldo Base', '', '', // colSpan 3
                    'Ingresos Adicionales (+)', '', '', '', '', // colSpan 5
                    'Egresos / Descuentos (-)', '', '', // colSpan 3
                    'Liquidación Final', '', '', // colSpan 3
                    'Estado'
                ];
                sheet.getRow(3).values = headerRow1Values;
                sheet.getRow(3).height = 24;
                sheet.mergeCells('A3:C3');
                sheet.mergeCells('D3:F3');
                sheet.mergeCells('G3:K3');
                sheet.mergeCells('L3:N3');
                sheet.mergeCells('O3:Q3');
                // Cabeceras de la tabla - Nivel 2 (Fila 4)
                const headerRow2Values = [
                    '#', 'Nombres', 'Contrato',
                    'Diario', 'Días T.', 'Sueldo B.',
                    'Ingresos Var.', 'Décimo 3', 'Décimo 4', 'F. Res.', 'Total +',
                    'IESS', 'Egresos Varios', 'Total -',
                    'Neto', 'Pagado', 'Pendiente',
                    'Estado Pago'
                ];
                sheet.getRow(4).values = headerRow2Values;
                sheet.getRow(4).height = 24;
                const applyHeaderStyles = (rowNum, bgColor, fgColor) => {
                    const row = sheet.getRow(rowNum);
                    row.eachCell((cell) => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: bgColor }
                        };
                        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: fgColor } };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                            left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                            bottom: { style: 'medium', color: { argb: 'FF808080' } },
                            right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
                        };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    });
                };
                applyHeaderStyles(3, 'FF1F4E78', 'FFFFFFFF');
                applyHeaderStyles(4, 'FF2F5597', 'FFFFFFFF');
                let currentRowIndex = 5;
                const dataRows = empleados.map((emp, index) => {
                    const raw = nominasList.find(n => n.empleadoId === emp.id);
                    const mapped = mapNominaRow(emp, raw, quincenaNum, fInicio, fFin);
                    return [
                        index + 1,
                        mapped.nombre,
                        mapped.contrato,
                        mapped.diario,
                        mapped.diasT,
                        mapped.sueldoB,
                        mapped.ingresosVar,
                        mapped.decimo3,
                        mapped.decimo4,
                        mapped.fRes,
                        mapped.totalIngresos,
                        mapped.iess,
                        mapped.egresosVarios,
                        mapped.totalEgresos,
                        mapped.neto,
                        mapped.pagado,
                        mapped.pendiente,
                        mapped.pendiente <= 0.01 ? 'PAGADO' : mapped.pagado > 0 ? 'ABONO PARCIAL' : 'PENDIENTE'
                    ];
                });
                dataRows.forEach((rowValues) => {
                    const row = sheet.addRow(rowValues);
                    row.height = 20;
                    row.eachCell((cell, colNum) => {
                        cell.font = { name: 'Calibri', size: 10 };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                        };
                        if (colNum === 1)
                            cell.alignment = { horizontal: 'center' };
                        else if (colNum === 2)
                            cell.alignment = { horizontal: 'left' };
                        else if (colNum === 3 || colNum === 18)
                            cell.alignment = { horizontal: 'center' };
                        else if (colNum === 5)
                            cell.alignment = { horizontal: 'center' };
                        else
                            cell.alignment = { horizontal: 'right' };
                        if ([4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(colNum)) {
                            cell.numFmt = '$#,##0.00';
                        }
                    });
                    currentRowIndex++;
                });
                const totalsRowValues = [
                    'TOTALES', '', '',
                    { formula: `SUM(D5:D${currentRowIndex - 1})` },
                    { formula: `SUM(E5:E${currentRowIndex - 1})` },
                    { formula: `SUM(F5:F${currentRowIndex - 1})` },
                    { formula: `SUM(G5:G${currentRowIndex - 1})` },
                    { formula: `SUM(H5:H${currentRowIndex - 1})` },
                    { formula: `SUM(I5:I${currentRowIndex - 1})` },
                    { formula: `SUM(J5:J${currentRowIndex - 1})` },
                    { formula: `SUM(K5:K${currentRowIndex - 1})` },
                    { formula: `SUM(L5:L${currentRowIndex - 1})` },
                    { formula: `SUM(M5:M${currentRowIndex - 1})` },
                    { formula: `SUM(N5:N${currentRowIndex - 1})` },
                    { formula: `SUM(O5:O${currentRowIndex - 1})` },
                    { formula: `SUM(P5:P${currentRowIndex - 1})` },
                    { formula: `SUM(Q5:Q${currentRowIndex - 1})` },
                    ''
                ];
                const totalsRow = sheet.addRow(totalsRowValues);
                sheet.mergeCells(`A${currentRowIndex}:C${currentRowIndex}`);
                totalsRow.height = 22;
                totalsRow.eachCell((cell, colNum) => {
                    cell.font = { name: 'Calibri', size: 10, bold: true };
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFD9E1F2' }
                    };
                    cell.border = {
                        top: { style: 'medium', color: { argb: 'FF808080' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'double', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                    if (colNum === 1)
                        cell.alignment = { horizontal: 'center' };
                    else if (colNum === 5)
                        cell.alignment = { horizontal: 'center' };
                    else if (colNum > 3) {
                        cell.alignment = { horizontal: 'right' };
                        if (colNum !== 5)
                            cell.numFmt = '$#,##0.00';
                    }
                });
                sheet.autoFilter = {
                    from: 'A4',
                    to: `R${currentRowIndex - 1}`
                };
                sheet.columns.forEach((column, index) => {
                    let maxLen = 0;
                    column.eachCell && column.eachCell({ includeEmpty: true }, (cell) => {
                        if (Number(cell.row) > 2 && Number(cell.row) < currentRowIndex) {
                            const valStr = cell.value ? String(cell.value) : '';
                            if (valStr.length > maxLen)
                                maxLen = valStr.length;
                        }
                    });
                    const colIndex = index + 1;
                    if (colIndex === 1)
                        column.width = 6;
                    else if (colIndex === 2)
                        column.width = 28;
                    else if (colIndex === 3)
                        column.width = 12;
                    else if ([4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(colIndex)) {
                        column.width = Math.max(maxLen + 4, 12);
                    }
                    else {
                        column.width = Math.max(maxLen + 3, 10);
                    }
                });
            };
            addQuincenaSheet('1ra Quincena', `NÓMINA DE COLABORADORES — 1RA QUINCENA — ${mesName.toUpperCase()} ${yVal}`, nominasQ1, 1, q1Inicio, q1Fin);
            addQuincenaSheet('2da Quincena', `NÓMINA DE COLABORADORES — 2DA QUINCENA — ${mesName.toUpperCase()} ${yVal}`, nominasQ2, 2, q2Inicio, q2Fin);
            // Hoja 3: Detalle de Movimientos
            const detailSheet = workbook.addWorksheet('Detalle de Movimientos');
            detailSheet.views = [{ showGridLines: true }];
            detailSheet.mergeCells('A1:E1');
            const detTitleCell = detailSheet.getCell('A1');
            detTitleCell.value = `DESGLOSE DETALLADO DE INGRESOS Y EGRESOS — ${mesName.toUpperCase()} ${yVal}`;
            detTitleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1F4E78' } };
            detTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            detailSheet.getRow(1).height = 28;
            let detailRowIndex = 3;
            for (const emp of empleados) {
                const empHE = detailedHorasExtras.filter(h => h.colaboradorId === emp.id);
                const empIng = detailedIngresos.filter(i => i.empleadoId === emp.id);
                const empEgr = detailedEgresos.filter(e => e.empleadoId === emp.id);
                const hasMovements = empHE.length > 0 || empIng.length > 0 || empEgr.length > 0;
                detailSheet.mergeCells(`A${detailRowIndex}:E${detailRowIndex}`);
                const nameCell = detailSheet.getCell(`A${detailRowIndex}`);
                nameCell.value = `COLABORADOR: ${emp.nombre.toUpperCase()} (${emp.tieneContrato !== false ? 'CONTRATO' : 'POR ASIS'})`;
                nameCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
                nameCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF2F2F2' }
                };
                detailSheet.getRow(detailRowIndex).height = 20;
                detailRowIndex++;
                const movHeaders = ['Fecha', 'Tipo', 'Concepto', 'Detalle / Horas', 'Monto'];
                const movHeaderRow = detailSheet.getRow(detailRowIndex);
                movHeaderRow.values = movHeaders;
                movHeaderRow.height = 18;
                movHeaderRow.eachCell((cell) => {
                    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF595959' }
                    };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });
                detailRowIndex++;
                let totalIngs = 0;
                let totalEgs = 0;
                // Horas Extras
                for (const he of empHE) {
                    const totalVal = Number(he.total);
                    totalIngs += totalVal;
                    const rowValues = [
                        he.fecha.toISOString().split('T')[0],
                        'INGRESO',
                        'HORA EXTRA',
                        `${he.horas} horas (${he.detalleHorario || he.descripcion || 'Extra'})`,
                        totalVal
                    ];
                    detailSheet.addRow(rowValues);
                    detailRowIndex++;
                }
                // Ingresos
                for (const ing of empIng) {
                    const totalVal = Number(ing.monto);
                    totalIngs += totalVal;
                    const rowValues = [
                        ing.fecha.toISOString().split('T')[0],
                        'INGRESO',
                        ing.tipo === 'TRAB_EMP' ? 'TRABAJO EMPRESA' : 'OTROS INGRESOS',
                        ing.motivo || '',
                        totalVal
                    ];
                    detailSheet.addRow(rowValues);
                    detailRowIndex++;
                }
                // Egresos
                for (const egr of empEgr) {
                    const totalVal = Number(egr.monto);
                    totalEgs += totalVal;
                    const rowValues = [
                        egr.fecha.toISOString().split('T')[0],
                        'EGRESO',
                        egr.tipo === 'ANTICIPO' ? 'ANTICIPO' : egr.tipo === 'MULTA' ? 'MULTA' : 'OTROS EGRESOS',
                        egr.motivo || '',
                        totalVal
                    ];
                    detailSheet.addRow(rowValues);
                    detailRowIndex++;
                }
                if (!hasMovements) {
                    const rowValues = ['—', '—', 'SIN MOVIMIENTOS', 'No registra horas extras, ingresos ni egresos en el período.', 0];
                    detailSheet.addRow(rowValues);
                    detailRowIndex++;
                }
                const summaryRowValues = [
                    'SUBTOTALES',
                    `Ingresos: ${totalIngs.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}`,
                    `Egresos: ${totalEgs.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}`,
                    'Neto Detalle:',
                    totalIngs - totalEgs
                ];
                const sumRow = detailSheet.getRow(detailRowIndex);
                sumRow.values = summaryRowValues;
                sumRow.height = 18;
                sumRow.eachCell((cell, colIndex) => {
                    cell.font = { name: 'Calibri', size: 9, bold: true };
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFEAEAEA' }
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF808080' } },
                        bottom: { style: 'thin', color: { argb: 'FF808080' } }
                    };
                    if (colIndex === 1)
                        cell.alignment = { horizontal: 'center' };
                    else if (colIndex === 5) {
                        cell.alignment = { horizontal: 'right' };
                        cell.numFmt = '$#,##0.00';
                    }
                    else {
                        cell.alignment = { horizontal: 'left' };
                    }
                });
                detailRowIndex++;
                detailSheet.addRow([]);
                detailSheet.addRow([]);
                detailRowIndex += 2;
            }
            detailSheet.columns = [
                { key: 'fecha', width: 14 },
                { key: 'tipo', width: 12 },
                { key: 'concepto', width: 18 },
                { key: 'detalle', width: 45 },
                { key: 'monto', width: 14 }
            ];
            detailSheet.eachRow((row, rowNum) => {
                if (rowNum > 2) {
                    const firstVal = String(row.getCell(1).value || '');
                    if (firstVal && !firstVal.includes('COLABORADOR') && !firstVal.includes('SUBTOTALES') && firstVal !== 'Fecha') {
                        row.getCell(1).alignment = { horizontal: 'center' };
                        row.getCell(2).alignment = { horizontal: 'center' };
                        row.getCell(3).alignment = { horizontal: 'left' };
                        row.getCell(4).alignment = { horizontal: 'left' };
                        row.getCell(5).alignment = { horizontal: 'right' };
                        row.getCell(5).numFmt = '$#,##0.00';
                        row.eachCell((cell) => {
                            cell.font = { name: 'Calibri', size: 9 };
                            cell.border = {
                                top: { style: 'thin', color: { argb: 'FFF0F0F0' } },
                                bottom: { style: 'thin', color: { argb: 'FFF0F0F0' } },
                                left: { style: 'thin', color: { argb: 'FFF0F0F0' } },
                                right: { style: 'thin', color: { argb: 'FFF0F0F0' } }
                            };
                        });
                        const tipoVal = row.getCell(2).value;
                        if (tipoVal === 'INGRESO') {
                            row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
                            row.getCell(2).font = { name: 'Calibri', size: 9, color: { argb: 'FF375623' }, bold: true };
                        }
                        else if (tipoVal === 'EGRESO') {
                            row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
                            row.getCell(2).font = { name: 'Calibri', size: 9, color: { argb: 'FFC65911' }, bold: true };
                        }
                    }
                }
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Nomina_${mesName}_${yVal}.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
        }
        catch (error) {
            console.error('[nomina/exportToExcel]', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al exportar la nómina a Excel' }
            });
        }
    }
}
