import { prisma } from '../../../../../config/prismaClient.js';
import { DEFAULT_HORARIOS_LABORALES, getHorarioEsperado, getHorarioLabel, getDiaConfig, normalizeHorariosLaborales, } from '../../../../../shared/utils/horarioLaboralHelpers.js';
const CONFIG_ID = 'default';
export async function loadHorariosLaborales() {
    const config = await prisma.configuracion.findUnique({ where: { id: CONFIG_ID } });
    return normalizeHorariosLaborales(config?.horariosLaborales ?? null);
}
export async function saveHorariosLaborales(data) {
    const normalized = normalizeHorariosLaborales(data);
    await prisma.configuracion.upsert({
        where: { id: CONFIG_ID },
        update: { horariosLaborales: normalized },
        create: {
            id: CONFIG_ID,
            horariosLaborales: normalized,
            condicionesPago: '',
            celular: '',
            email: '',
            direccion: '',
            diasValidez: 3,
        },
    });
    return normalized;
}
export async function getHorarioDelDia(fecha) {
    const config = await loadHorariosLaborales();
    const fechaStr = fecha.slice(0, 10);
    const diaConfig = getDiaConfig(config, fechaStr);
    const esperado = getHorarioEsperado(config, fechaStr);
    const label = getHorarioLabel(config, fechaStr);
    return {
        fecha: fechaStr,
        label,
        diaConfig,
        esperado,
        config,
    };
}
export { DEFAULT_HORARIOS_LABORALES };
