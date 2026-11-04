// La ventana para salir es independiente del horario de referencia guardado.
// No cambiar esa configuración: también se usa en asistencia automática e históricos.
export const INICIO_VENTANA_ALMUERZO_MIN = 12 * 60;
export const FIN_VENTANA_ALMUERZO_MIN = 14 * 60;
export const DURACION_ALMUERZO_MIN = 60;
export function puedeIniciarAlmuerzo(ahora) {
    const ecuador = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
    const minutos = ecuador.getUTCHours() * 60 + ecuador.getUTCMinutes();
    return minutos >= INICIO_VENTANA_ALMUERZO_MIN && minutos <= FIN_VENTANA_ALMUERZO_MIN;
}
export function calcularAtrasoAlmuerzo(inicio, regreso) {
    const duracion = (regreso.getTime() - new Date(inicio).getTime()) / 60000;
    return Math.max(0, Math.round(duracion - DURACION_ALMUERZO_MIN));
}
