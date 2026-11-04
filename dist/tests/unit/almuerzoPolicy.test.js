import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularAtrasoAlmuerzo } from '../../features/asistencia/domain/almuerzoPolicy.js';
import { getOpcionesMarcacion, resolveTipoRegistro } from '../../features/asistencia/domain/marcacionLogic.js';
import { calcularMultaAtraso, normalizeHorariosLaborales } from '../../shared/utils/horarioLaboralHelpers.js';
const hora = (time) => new Date(`2026-11-04T${time}-05:00`);
const entrada = [{ tipo: 'ENTRADA' }];
const diaConfig = { entrada: '08:00', inicioAlmuerzo: '13:00', finAlmuerzo: '14:00', salida: '17:30' };
describe('Ventana de salida a almuerzo en Ecuador', () => {
    for (const [time, permitido] of [
        ['11:59:59', false], ['12:00:00', true], ['12:30:00', true],
        ['13:00:00', true], ['14:00:00', true], ['14:00:59', true],
        ['14:01:00', false], ['14:30:00', false],
    ]) {
        test(`${time}: ${permitido ? 'permite' : 'rechaza'} salida, aun con configuración anterior`, () => {
            const opciones = getOpcionesMarcacion(entrada, 'Tiempo Completo', diaConfig, hora(time));
            assert.equal(opciones.some(o => o.tipo === 'INICIO_ALMUERZO'), permitido);
            const registrar = () => resolveTipoRegistro(entrada, {
                tipo: 'INICIO_ALMUERZO', tipoContrato: 'Tiempo Completo', diaConfig, horaActual: hora(time),
            });
            if (permitido)
                assert.equal(registrar().tipo, 'INICIO_ALMUERZO');
            else
                assert.throws(registrar, /no está permitido/);
        });
    }
    test('la selección automática también permite almorzar desde las 12:00', () => {
        assert.equal(resolveTipoRegistro(entrada, { diaConfig, horaActual: hora('12:00:00') }).tipo, 'INICIO_ALMUERZO');
    });
    test('mantiene la entrada obligatoria, el medio día y los días completados', () => {
        for (const [marks, contrato] of [
            [[], 'Tiempo Completo'], [entrada, 'Medio Día'],
            [[...entrada, { tipo: 'SALIDA' }], 'Tiempo Completo'],
            [[{ tipo: 'PERMISO' }], 'Tiempo Completo'],
        ]) {
            assert.ok(!getOpcionesMarcacion([...marks], contrato, diaConfig, hora('12:30:00'))
                .some(o => o.tipo === 'INICIO_ALMUERZO'));
        }
    });
    test('el regreso sigue disponible después de cerrar la ventana, incluso con atraso', () => {
        const marks = [...entrada, { tipo: 'INICIO_ALMUERZO', fechaHora: hora('14:00:00') }];
        for (const time of ['14:30:00', '15:00:00', '15:15:00']) {
            assert.deepEqual(getOpcionesMarcacion(marks, 'Tiempo Completo', diaConfig, hora(time))
                .map(o => o.tipo), ['FIN_ALMUERZO']);
        }
    });
    test('no ofrece una segunda salida a almuerzo', () => {
        const marks = [...entrada, { tipo: 'INICIO_ALMUERZO' }, { tipo: 'FIN_ALMUERZO' }];
        assert.ok(!getOpcionesMarcacion(marks, 'Tiempo Completo', diaConfig, hora('13:30:00'))
            .some(o => o.tipo === 'INICIO_ALMUERZO'));
    });
});
describe('Duración de una hora desde la salida real', () => {
    for (const [salida, regreso] of [['12:00:00', '13:00:00'], ['12:35:00', '13:35:00'], ['14:00:00', '15:00:00']]) {
        test(`${salida} → ${regreso} no genera atraso`, () => {
            assert.equal(calcularAtrasoAlmuerzo(hora(salida), hora(regreso)), 0);
        });
    }
    test('regresar antes de una hora no genera atraso', () => {
        assert.equal(calcularAtrasoAlmuerzo(hora('14:00:00'), hora('14:45:00')), 0);
    });
    test('14:00 → 15:01 registra un minuto de atraso; conserva las multas configuradas', () => {
        assert.equal(calcularAtrasoAlmuerzo(hora('14:00:00'), hora('15:01:00')), 1);
        assert.equal(calcularMultaAtraso(calcularAtrasoAlmuerzo(hora('14:00:00'), hora('15:08:00')), 8), 0);
        assert.equal(calcularMultaAtraso(calcularAtrasoAlmuerzo(hora('14:00:00'), hora('15:09:00')), 8), 2);
    });
    test('la configuración de referencia almacenada conserva su duración original', () => {
        const config = normalizeHorariosLaborales({ semana: diaConfig });
        assert.equal(config.semana.inicioAlmuerzo, '13:00');
        assert.equal(config.semana.finAlmuerzo, '14:00');
        assert.equal(config.semana.salida, '17:30');
    });
});
