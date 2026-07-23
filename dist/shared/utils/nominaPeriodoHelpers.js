const TZ_ECUADOR = 'America/Guayaquil';
export function toDateKey(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(0, 10))) {
        return d.slice(0, 10);
    }
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-CA', { timeZone: TZ_ECUADOR });
}
/** Lunes (1) a sábado (6). Domingo no es día laborable. */
export function isDiaLaboralSemana(dateKey) {
    const [y, m, day] = dateKey.split('-').map(Number);
    const dow = new Date(y, m - 1, day).getDay();
    return dow >= 1 && dow <= 6;
}
export function iterDatesInPeriod(fechaInicio, fechaFin) {
    const dates = [];
    const cursor = new Date(`${fechaInicio.slice(0, 10)}T12:00:00`);
    const end = new Date(`${fechaFin.slice(0, 10)}T12:00:00`);
    while (cursor <= end) {
        dates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}
export function diasEnPeriodo(fechaInicio, fechaFin) {
    return iterDatesInPeriod(fechaInicio, fechaFin).length;
}
export function normalizeFeriados(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object')
            continue;
        const fecha = String(item.fecha || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
            continue;
        const descripcion = String(item.descripcion || '').trim();
        out.push({ fecha, descripcion });
    }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
export function feriadosEnPeriodo(feriados, fechaInicio, fechaFin) {
    const ini = fechaInicio.slice(0, 10);
    const fin = fechaFin.slice(0, 10);
    return normalizeFeriados(feriados).filter((f) => f.fecha >= ini && f.fecha <= fin);
}
/** Días calendario del período (quincena = 15), menos feriados registrados. */
export function calcDiasLaborables(fechaInicio, fechaFin, feriados = []) {
    const total = diasEnPeriodo(fechaInicio, fechaFin);
    const feriadosCount = feriadosEnPeriodo(feriados, fechaInicio, fechaFin).length;
    return Math.max(0, total - feriadosCount);
}
function countDomingosEnPeriodo(fechaInicio, fechaFin) {
    return iterDatesInPeriod(fechaInicio, fechaFin).filter((d) => !isDiaLaboralSemana(d)).length;
}
function groupMarcacionesByDay(marcaciones) {
    const map = new Map();
    for (const m of marcaciones) {
        const key = toDateKey(m.fechaHora);
        if (!map.has(key))
            map.set(key, []);
        map.get(key).push(m);
    }
    return map;
}
/** Día pagable: salida registrada (normal o con permiso), permiso pagado, o marcación legacy completa. */
export function isDiaAsistenciaPagable(marks) {
    const tipos = new Set(marks.map((m) => m.tipo));
    return tipos.has('SALIDA') || tipos.has('SALIDA_PERMISO') || tipos.has('PERMISO') || tipos.has('MARCACION');
}
export function calcDiasLaborados(marcaciones, feriados, fechaInicio, fechaFin, hasContract) {
    const ini = fechaInicio.slice(0, 10);
    const fin = fechaFin.slice(0, 10);
    const byDay = groupMarcacionesByDay(marcaciones);
    let diasAsistencia = 0;
    for (const [dateKey, marks] of byDay) {
        if (dateKey < ini || dateKey > fin)
            continue;
        if (!isDiaLaboralSemana(dateKey))
            continue;
        if (isDiaAsistenciaPagable(marks))
            diasAsistencia += 1;
    }
    const feriadosDelPeriodo = feriadosEnPeriodo(feriados, fechaInicio, fechaFin).filter((f) => isDiaLaboralSemana(f.fecha));
    const lunSatEnPeriodo = iterDatesInPeriod(fechaInicio, fechaFin).filter(isDiaLaboralSemana).length;
    const diasRequeridosAsistencia = Math.max(0, lunSatEnPeriodo - feriadosDelPeriodo.length);
    let diasFeriado = 0;
    if (hasContract) {
        for (const f of feriadosDelPeriodo) {
            const marks = byDay.get(f.fecha);
            const yaContado = marks && isDiaAsistenciaPagable(marks);
            if (!yaContado)
                diasFeriado += 1;
        }
    }
    let diasLaborados = diasAsistencia + diasFeriado;
    // Contrato: domingos del período cuentan si asistió todos los lun–sáb requeridos (sin feriado).
    if (hasContract && diasAsistencia >= diasRequeridosAsistencia && diasRequeridosAsistencia > 0) {
        diasLaborados += countDomingosEnPeriodo(fechaInicio, fechaFin);
    }
    // Por asistencia: quincena completa si marcó todos los lun–sáb del período.
    if (!hasContract && diasAsistencia >= diasRequeridosAsistencia && diasRequeridosAsistencia > 0) {
        diasLaborados = calcDiasLaborables(fechaInicio, fechaFin, feriados);
    }
    const diasLaborables = calcDiasLaborables(fechaInicio, fechaFin, feriados);
    diasLaborados = Math.min(diasLaborados, diasLaborables);
    return { diasAsistencia, diasFeriado, diasLaborados };
}
