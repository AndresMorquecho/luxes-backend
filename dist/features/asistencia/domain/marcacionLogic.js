export const SECUENCIA_MARCACIONES = [
    { tipo: 'ENTRADA', label: 'Entrada' },
    { tipo: 'INICIO_ALMUERZO', label: 'Inicio Almuerzo' },
    { tipo: 'FIN_ALMUERZO', label: 'Fin Almuerzo' },
    { tipo: 'SALIDA', label: 'Salida' },
];
export const MARCACION_FIN_HORAS_EXTRA = {
    tipo: 'FIN_HORAS_EXTRA',
    label: 'Fin Horas Extras',
};
export const TIPOS_SELECCIONABLES = [
    { tipo: 'ENTRADA', label: 'Entrada', shortLabel: 'Entrada' },
    { tipo: 'INICIO_ALMUERZO', label: 'Salida almuerzo', shortLabel: 'Sal. almuerzo' },
    { tipo: 'FIN_ALMUERZO', label: 'Regreso almuerzo', shortLabel: 'Reg. almuerzo' },
    { tipo: 'SALIDA', label: 'Salida', shortLabel: 'Salida' },
    { tipo: 'FIN_HORAS_EXTRA', label: 'Fin horas extras', shortLabel: 'Horas extras' },
    { tipo: 'SALIDA_PERMISO', label: 'Salida con permiso', shortLabel: 'Salida c/permiso' },
];
function findStep(tipo) {
    return SECUENCIA_MARCACIONES.find((s) => s.tipo === tipo);
}
function findSelectable(tipo) {
    return TIPOS_SELECCIONABLES.find((s) => s.tipo === tipo);
}
export function resolveProximaMarcacion(marks, tipoContrato = 'Tiempo Completo', diaConfig) {
    const opciones = getOpcionesMarcacion(marks, tipoContrato, diaConfig);
    if (opciones.length === 0) {
        return { proxima: null, permiteOmitirAlmuerzo: false, completado: true, marcacionesRegistradas: marks.length };
    }
    const tipos = new Set(marks.map((m) => m.tipo));
    const marcacionesRegistradas = marks.filter((m) => SECUENCIA_MARCACIONES.some((s) => s.tipo === m.tipo) || m.tipo === 'SALIDA_PERMISO' || m.tipo === 'FIN_HORAS_EXTRA').length;
    const proxima = opciones[0];
    const alternativa = opciones.find((o) => o.tipo === 'SALIDA' && proxima.tipo === 'INICIO_ALMUERZO');
    return {
        proxima: { tipo: proxima.tipo, label: proxima.label },
        alternativa: alternativa ? { tipo: alternativa.tipo, label: alternativa.label } : undefined,
        permiteOmitirAlmuerzo: Boolean(alternativa),
        completado: false,
        marcacionesRegistradas,
    };
}
export function getOpcionesMarcacion(marks, tipoContrato = 'Tiempo Completo', diaConfig) {
    const tipos = new Set(marks.map((m) => m.tipo));
    if (tipos.has('PERMISO'))
        return [];
    if (tipos.has('FIN_HORAS_EXTRA'))
        return [];
    if (tipos.has('SALIDA_PERMISO'))
        return [];
    const opciones = [];
    if (!tipos.has('ENTRADA')) {
        opciones.push(TIPOS_SELECCIONABLES[0]);
        return opciones;
    }
    if (tipoContrato === 'Medio Día') {
        if (!tipos.has('SALIDA')) {
            opciones.push(TIPOS_SELECCIONABLES[3]);
        }
        return opciones;
    }
    // Get current Ecuador time in minutes
    const nowEcuador = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const currentMin = nowEcuador.getUTCHours() * 60 + nowEcuador.getUTCMinutes();
    const parseTimeToMinutes = (timeStr) => {
        if (!timeStr)
            return null;
        const parts = timeStr.split(':').map(Number);
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]))
            return null;
        return parts[0] * 60 + parts[1];
    };
    const inicioAlmuerzoMin = parseTimeToMinutes(diaConfig?.inicioAlmuerzo) ?? (13 * 60); // 13:00
    const salidaMin = parseTimeToMinutes(diaConfig?.salida) ?? (17 * 60 + 30); // 17:30
    const enAlmuerzo = tipos.has('INICIO_ALMUERZO') && !tipos.has('FIN_ALMUERZO');
    if (enAlmuerzo) {
        opciones.push(TIPOS_SELECCIONABLES[2]); // Regreso almuerzo
        return opciones;
    }
    if (!tipos.has('SALIDA')) {
        if (!tipos.has('INICIO_ALMUERZO')) {
            // Salida almuerzo starts at inicioAlmuerzoMin, max 14:30
            const canLunch = currentMin >= inicioAlmuerzoMin && currentMin <= (14 * 60 + 30);
            if (canLunch) {
                opciones.push(TIPOS_SELECCIONABLES[1]); // Salida almuerzo
            }
            // Salida only from salidaMin onwards
            if (currentMin >= salidaMin) {
                opciones.push(TIPOS_SELECCIONABLES[3]); // Salida
            }
            opciones.push(TIPOS_SELECCIONABLES[5]); // Salida con permiso
        }
        else if (tipos.has('FIN_ALMUERZO')) {
            // Salida only from salidaMin onwards
            if (currentMin >= salidaMin) {
                opciones.push(TIPOS_SELECCIONABLES[3]); // Salida
            }
            opciones.push(TIPOS_SELECCIONABLES[5]); // Salida con permiso
        }
        return opciones;
    }
    if (tipos.has('SALIDA')) {
        // FIN_HORAS_EXTRA only available once 30-min tolerance window has passed
        // i.e. current time >= scheduled exit + 30 min
        const finHoraExtraMin = salidaMin + 30;
        if (currentMin >= finHoraExtraMin) {
            opciones.push(TIPOS_SELECCIONABLES[4]); // Fin horas extras
        }
    }
    return opciones;
}
export function validateTipoMarcacion(marks, tipo, tipoContrato = 'Tiempo Completo', diaConfig) {
    const allowed = getOpcionesMarcacion(marks, tipoContrato, diaConfig);
    const match = allowed.find((o) => o.tipo === tipo);
    if (!match) {
        throw new Error('Ese tipo de marcación no está permitido en este momento.');
    }
    return { tipo: match.tipo, label: match.label };
}
export function resolveTipoRegistro(marks, options = {}) {
    const tipoContrato = options.tipoContrato || 'Tiempo Completo';
    if (options.tipo) {
        return validateTipoMarcacion(marks, options.tipo, tipoContrato, options.diaConfig);
    }
    const info = resolveProximaMarcacion(marks, tipoContrato, options.diaConfig);
    if (!info.proxima) {
        throw new Error('El colaborador ya completó las marcaciones del día.');
    }
    const hora = options.horaActual ?? new Date();
    const horaDelDia = hora.getHours() + hora.getMinutes() / 60;
    if (info.permiteOmitirAlmuerzo && info.alternativa) {
        const forzarSalida = options.omitirAlmuerzo === true ||
            (options.omitirAlmuerzo !== false && horaDelDia >= 14);
        if (forzarSalida) {
            return info.alternativa;
        }
    }
    return info.proxima;
}
export function isDiaLaboralCompleto(marks) {
    const tipos = new Set(marks.map((m) => m.tipo));
    return tipos.has('PERMISO') || tipos.has('SALIDA') || tipos.has('SALIDA_PERMISO') || tipos.has('FIN_HORAS_EXTRA');
}
export function puedeRegistrarMarcacion(marks, tipoContrato = 'Tiempo Completo', diaConfig) {
    return getOpcionesMarcacion(marks, tipoContrato, diaConfig).length > 0;
}
export function calcularHorasExtrasDesdeSalida(marks, finHora) {
    const salida = marks.find((m) => m.tipo === 'SALIDA');
    if (!salida?.fechaHora) {
        throw new Error('Debe registrar la salida antes de marcar horas extras.');
    }
    const salidaAt = new Date(salida.fechaHora);
    if (finHora.getTime() <= salidaAt.getTime()) {
        throw new Error('La hora de fin de horas extras debe ser posterior a la salida.');
    }
    const ms = finHora.getTime() - salidaAt.getTime();
    const horas = Math.round((ms / 3600000) * 100) / 100;
    if (horas < 0.01) {
        throw new Error('El tiempo de horas extras es demasiado corto.');
    }
    const fmt = (d) => d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
    return {
        horas,
        detalleHorario: `${fmt(salidaAt)} - ${fmt(finHora)}`,
        salidaAt,
    };
}
/**
 * Calculates overtime from the SCHEDULED exit time (diaConfig.salida) to finHora.
 * This is the correct calculation for FIN_HORAS_EXTRA:
 * - The 30-min tolerance window is NOT counted as overtime.
 * - Hours are measured as exact minutes / 60, then rounded to 2 decimals.
 * - The caller is responsible for rounding to half-hour fractions for billing.
 *
 * @param diaConfig - The day horario config (must have .salida HH:MM)
 * @param finHora   - The time when FIN_HORAS_EXTRA was marked (UTC Date)
 * @param dateStr   - The date string 'YYYY-MM-DD' for building the scheduled exit timestamp
 */
export function calcularHorasExtrasDesdeConfig(diaConfig, finHora, dateStr) {
    const [sh, sm] = diaConfig.salida.split(':').map(Number);
    const [y, mo, d] = dateStr.split('-').map(Number);
    // scheduled exit in UTC (Ecuador = UTC-5, so add 5h)
    const salidaConfigAt = new Date(Date.UTC(y, mo - 1, d, sh + 5, sm, 0));
    if (finHora.getTime() <= salidaConfigAt.getTime()) {
        throw new Error('La hora de fin de horas extras debe ser posterior a la salida programada.');
    }
    const ms = finHora.getTime() - salidaConfigAt.getTime();
    const minutosTotal = ms / 60000;
    const horas = Math.round((minutosTotal / 60) * 100) / 100;
    const fmt = (d) => d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
    return {
        horas,
        detalleHorario: `${diaConfig.salida} - ${fmt(finHora)}`,
        salidaConfigAt,
    };
}
/**
 * Rounds raw hours to the nearest half-hour fraction for billing.
 * Examples: 0.34h → 0.5h, 0.51h → 0.5h, 0.76h → 1h, 1.3h → 1.5h
 */
export function redondearAMediaHora(horas) {
    return Math.round(horas * 2) / 2;
}
export function buildResumenMarcaciones(marks) {
    const byTipo = Object.fromEntries(marks.map((m) => [m.tipo, m]));
    return SECUENCIA_MARCACIONES.map((step) => ({
        ...step,
        registrada: Boolean(byTipo[step.tipo]),
    }));
}
export { findStep, findSelectable };
