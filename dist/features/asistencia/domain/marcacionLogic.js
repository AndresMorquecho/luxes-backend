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
];
function findStep(tipo) {
    return SECUENCIA_MARCACIONES.find((s) => s.tipo === tipo);
}
function findSelectable(tipo) {
    return TIPOS_SELECCIONABLES.find((s) => s.tipo === tipo);
}
export function resolveProximaMarcacion(marks) {
    const opciones = getOpcionesMarcacion(marks);
    if (opciones.length === 0) {
        return { proxima: null, permiteOmitirAlmuerzo: false, completado: true, marcacionesRegistradas: marks.length };
    }
    const tipos = new Set(marks.map((m) => m.tipo));
    const marcacionesRegistradas = marks.filter((m) => SECUENCIA_MARCACIONES.some((s) => s.tipo === m.tipo) || m.tipo === 'FIN_HORAS_EXTRA').length;
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
export function getOpcionesMarcacion(marks) {
    const tipos = new Set(marks.map((m) => m.tipo));
    if (tipos.has('PERMISO'))
        return [];
    if (tipos.has('FIN_HORAS_EXTRA'))
        return [];
    const opciones = [];
    if (!tipos.has('ENTRADA')) {
        opciones.push(TIPOS_SELECCIONABLES[0]);
        return opciones;
    }
    const enAlmuerzo = tipos.has('INICIO_ALMUERZO') && !tipos.has('FIN_ALMUERZO');
    if (enAlmuerzo) {
        opciones.push(TIPOS_SELECCIONABLES[2]);
        return opciones;
    }
    if (!tipos.has('SALIDA')) {
        if (!tipos.has('INICIO_ALMUERZO')) {
            opciones.push(TIPOS_SELECCIONABLES[1], TIPOS_SELECCIONABLES[3]);
        }
        else if (tipos.has('FIN_ALMUERZO')) {
            opciones.push(TIPOS_SELECCIONABLES[3]);
        }
        return opciones;
    }
    if (tipos.has('SALIDA')) {
        opciones.push(TIPOS_SELECCIONABLES[4]);
    }
    return opciones;
}
export function validateTipoMarcacion(marks, tipo) {
    const allowed = getOpcionesMarcacion(marks);
    const match = allowed.find((o) => o.tipo === tipo);
    if (!match) {
        throw new Error('Ese tipo de marcación no está permitido en este momento.');
    }
    return { tipo: match.tipo, label: match.label };
}
export function resolveTipoRegistro(marks, options = {}) {
    if (options.tipo) {
        return validateTipoMarcacion(marks, options.tipo);
    }
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
    return tipos.has('PERMISO') || tipos.has('FIN_HORAS_EXTRA');
}
export function puedeRegistrarMarcacion(marks) {
    return getOpcionesMarcacion(marks).length > 0;
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
export function buildResumenMarcaciones(marks) {
    const byTipo = Object.fromEntries(marks.map((m) => [m.tipo, m]));
    return SECUENCIA_MARCACIONES.map((step) => ({
        ...step,
        registrada: Boolean(byTipo[step.tipo]),
    }));
}
export { findStep, findSelectable };
