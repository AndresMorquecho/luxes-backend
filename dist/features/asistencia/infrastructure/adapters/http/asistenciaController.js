import { getHorarioDelDia, loadHorariosLaborales, saveHorariosLaborales, } from '../persistence/horarioLaboralStore.js';
export class AsistenciaController {
    asistenciaService;
    constructor(asistenciaService) {
        this.asistenciaService = asistenciaService;
    }
    async list(req, res) {
        try {
            const getTodayEcuador = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0];
            const desde = String(req.query.desde ?? getTodayEcuador());
            const hasta = String(req.query.hasta ?? getTodayEcuador());
            const asistencias = await this.asistenciaService.listAsistencias(desde, hasta);
            return res.status(200).json({
                success: true,
                data: asistencias.map((a) => a.toJSON()),
            });
        }
        catch (error) {
            console.error('[asistencia/list]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener registros de asistencia' },
            });
        }
    }
    async getProxima(req, res) {
        try {
            const empleadoId = String(req.params.empleadoId);
            const proxima = await this.asistenciaService.getProximaMarcacion(empleadoId);
            return res.status(200).json({
                success: true,
                data: proxima,
            });
        }
        catch (error) {
            console.error('[asistencia/getProxima]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener próxima marcación' },
            });
        }
    }
    async getTodayForEmpleado(req, res) {
        try {
            const empleadoId = String(req.params.empleadoId);
            const records = await this.asistenciaService.getTodayForEmpleado(empleadoId);
            return res.status(200).json({
                success: true,
                data: records.map((r) => r.toJSON()),
            });
        }
        catch (error) {
            console.error('[asistencia/getTodayForEmpleado]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener marcaciones del empleado' },
            });
        }
    }
    async registrar(req, res) {
        try {
            const { empleadoId, ubicacion, omitirAlmuerzo, tipo } = req.body;
            if (!empleadoId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'El ID del empleado es requerido' },
                });
            }
            const lat = ubicacion?.lat ? Number(ubicacion.lat) : null;
            const lng = ubicacion?.lng ? Number(ubicacion.lng) : null;
            const asistencia = await this.asistenciaService.registrarAsistencia({
                empleadoId: String(empleadoId).trim(),
                ubicacionLat: lat,
                ubicacionLng: lng,
                omitirAlmuerzo: omitirAlmuerzo === true,
                tipo: tipo ? String(tipo) : undefined,
            });
            return res.status(201).json({
                success: true,
                data: asistencia,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Error al registrar asistencia';
            const isClientError = message.includes('no encontrado') || message.includes('ya completó');
            console.error('[asistencia/registrar]', error);
            return res.status(isClientError ? 400 : 500).json({
                success: false,
                error: {
                    code: isClientError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
                    message,
                },
            });
        }
    }
    async registrarPermiso(req, res) {
        try {
            const { empleadoId, fecha } = req.body;
            if (!empleadoId || !fecha) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'El ID de empleado y la fecha son requeridos' },
                });
            }
            const asistencia = await this.asistenciaService.registrarPermiso({
                empleadoId: String(empleadoId).trim(),
                fecha: String(fecha),
            });
            return res.status(201).json({
                success: true,
                data: asistencia.toJSON(),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Error al registrar permiso';
            const isClientError = message.includes('no encontrado') || message.includes('ya tiene');
            console.error('[asistencia/registrarPermiso]', error);
            return res.status(isClientError ? 400 : 500).json({
                success: false,
                error: {
                    code: isClientError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
                    message,
                },
            });
        }
    }
    async getHorarioDelDia(req, res) {
        try {
            const getTodayEcuador = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0];
            const fecha = String(req.query.fecha ?? getTodayEcuador());
            const data = await getHorarioDelDia(fecha);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            console.error('[asistencia/getHorarioDelDia]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener horario del día' },
            });
        }
    }
    async getHorarioConfig(_req, res) {
        try {
            const config = await loadHorariosLaborales();
            return res.status(200).json({ success: true, data: config });
        }
        catch (error) {
            console.error('[asistencia/getHorarioConfig]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener configuración de horarios' },
            });
        }
    }
    async saveHorarioConfig(req, res) {
        try {
            const config = await saveHorariosLaborales(req.body);
            return res.status(200).json({ success: true, data: config });
        }
        catch (error) {
            console.error('[asistencia/saveHorarioConfig]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al guardar configuración de horarios' },
            });
        }
    }
    async eliminarPermiso(req, res) {
        try {
            const empleadoId = req.body.empleadoId || req.query.empleadoId;
            const fecha = req.body.fecha || req.query.fecha;
            if (!empleadoId || !fecha) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'El ID de empleado y la fecha son requeridos' },
                });
            }
            await this.asistenciaService.eliminarPermiso({
                empleadoId: String(empleadoId).trim(),
                fecha: String(fecha),
            });
            return res.status(200).json({
                success: true,
                data: null,
            });
        }
        catch (error) {
            console.error('[asistencia/eliminarPermiso]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar el permiso' },
            });
        }
    }
}
