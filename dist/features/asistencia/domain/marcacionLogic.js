export const SECUENCIA_MARCACIONES = [
    { tipo: 'ENTRADA', label: 'Entrada' },
    { tipo: 'INICIO_ALMUERZO', label: 'Inicio Almuerzo' },
    { tipo: 'FIN_ALMUERZO', label: 'Fin Almuerzo' },
    { tipo: 'SALIDA', label: 'Salida' },
];
function findStep(tipo) {
    return SECUENCIA_MARCACIONES.find((s) => s.tipo === tipo);
}
export function resolveProximaMarcacion(marks) {
    const tipos = new Set(marks.map((m) => m.tipo));
    const marcacionesRegistradas = marks.filter((m) => SECUENCIA_MARCACIONES.some((s) => s.tipo === m.tipo)).length;
    if (tipos.has('SALIDA') || tipos.has('PERMISO')) {
        return { proxima: null, permiteOmitirAlmuerzo: false, completado: true, marcacionesRegistradas };
    }
    if (!tipos.has('ENTRADA')) {
        return {
            proxima: SECUENCIA_MARCACIONES[0],
            permiteOmitirAlmuerzo: false,
            completado: false,
            marcacionesRegistradas,
        };
    }
    if (tipos.has('INICIO_ALMUERZO') && !tipos.has('FIN_ALMUERZO')) {
        return {
            proxima: SECUENCIA_MARCACIONES[2],
            permiteOmitirAlmuerzo: false,
            completado: false,
            marcacionesRegistradas,
        };
    }
    if (tipos.has('FIN_ALMUERZO') && !tipos.has('SALIDA')) {
        return {
            proxima: SECUENCIA_MARCACIONES[3],
            permiteOmitirAlmuerzo: false,
            completado: false,
            marcacionesRegistradas,
        };
    }
    if (tipos.has('ENTRADA') &&
        !tipos.has('INICIO_ALMUERZO') &&
        !tipos.has('FIN_ALMUERZO') &&
        !tipos.has('SALIDA')) {
        return {
            proxima: SECUENCIA_MARCACIONES[1],
            alternativa: SECUENCIA_MARCACIONES[3],
            permiteOmitirAlmuerzo: true,
            completado: false,
            marcacionesRegistradas,
        };
    }
    return { proxima: null, permiteOmitirAlmuerzo: false, completado: true, marcacionesRegistradas };
}
export function resolveTipoRegistro(marks, options = {}) {
    const info = resolveProximaMarcacion(marks);
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
    return tipos.has('SALIDA') || tipos.has('PERMISO');
}
export function buildResumenMarcaciones(marks) {
    const byTipo = Object.fromEntries(marks.map((m) => [m.tipo, m]));
    return SECUENCIA_MARCACIONES.map((step) => ({
        ...step,
        registrada: Boolean(byTipo[step.tipo]),
    }));
}
export { findStep };
