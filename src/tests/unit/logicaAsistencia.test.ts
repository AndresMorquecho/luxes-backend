/**
 * tests/unit/logicaAsistencia.test.ts
 *
 * Pruebas unitarias PURAS (sin base de datos) para toda la lógica de asistencia:
 *   - calcularMultaAtraso         → multas $2/$3/$4 por atraso de entrada / almuerzo
 *   - calcularHorasExtrasDesdeConfig → horas extras contadas desde 17:30 config
 *   - redondearAMediaHora         → redondeo a fracciones de 0.5h para facturar
 *   - getOpcionesMarcacion        → opciones QR según tipo de jornada y hora
 *   - normalizeHorariosLaborales  → persistencia de config con defaults
 *   - Lógica SALIDA_PERMISO       → cálculo de horas restantes por tipo de jornada
 *
 * Ejecutar:
 *   npx tsx --test src/tests/unit/logicaAsistencia.test.ts
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── imports de lógica pura (sin Prisma) ─────────────────────────────────────
import {
  calcularMultaAtraso,
  normalizeHorariosLaborales,
  DEFAULT_HORARIOS_LABORALES,
} from '../../shared/utils/horarioLaboralHelpers.js';

import {
  getOpcionesMarcacion,
  calcularHorasExtrasDesdeConfig,
  redondearAMediaHora,
} from '../../features/asistencia/domain/marcacionLogic.js';

// ════════════════════════════════════════════════════════════════════════════
// 1. MULTAS POR ATRASO — calcularMultaAtraso
// ════════════════════════════════════════════════════════════════════════════
describe('calcularMultaAtraso (tolerancia=8 min)', () => {
  const TOL = 8;

  test('llega puntual → $0', () => {
    assert.equal(calcularMultaAtraso(0, TOL), 0);
  });

  test('llega exactamente en la tolerancia → $0', () => {
    assert.equal(calcularMultaAtraso(8, TOL), 0);
  });

  test('1 min más allá de tolerancia (08:09) → $2', () => {
    assert.equal(calcularMultaAtraso(9, TOL), 2);
  });

  test('tramo 1 máximo (08:16, +8 min sobre tol) → $2', () => {
    assert.equal(calcularMultaAtraso(16, TOL), 2);
  });

  test('primer minuto de tramo 2 (08:17, +9 sobre tol) → $3', () => {
    assert.equal(calcularMultaAtraso(17, TOL), 3);
  });

  test('tramo 2 máximo (08:24, +16 sobre tol) → $3', () => {
    assert.equal(calcularMultaAtraso(24, TOL), 3);
  });

  test('primer minuto de tramo 3 (08:25, +17 sobre tol) → $4', () => {
    assert.equal(calcularMultaAtraso(25, TOL), 4);
  });

  test('llegada muy tarde (+60 min) → $4', () => {
    assert.equal(calcularMultaAtraso(68, TOL), 4);
  });

  test('tolerancia=0 (sin gracia): 1 min → $2', () => {
    assert.equal(calcularMultaAtraso(1, 0), 2);
  });

  test('tolerancia=15: llega +15 → $0, llega +16 → $2', () => {
    assert.equal(calcularMultaAtraso(15, 15), 0);
    assert.equal(calcularMultaAtraso(16, 15), 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. MULTAS ALMUERZO — misma función, distintos contextos
// ════════════════════════════════════════════════════════════════════════════
describe('calcularMultaAtraso — regreso almuerzo', () => {
  const TOL = 8;
  // Config: almuerzo 13:00–14:00 (60 min). Si regresa a las 14:15 → 15 min tarde

  test('regresa 5 min tarde → dentro de tolerancia → $0', () => {
    assert.equal(calcularMultaAtraso(5, TOL), 0);
  });

  test('regresa 13 min tarde (=5 sobre tol) → $2', () => {
    assert.equal(calcularMultaAtraso(13, TOL), 2);  // 13 - 8 = 5 → tramo 1
  });

  test('regresa 20 min tarde (=12 sobre tol) → $3', () => {
    assert.equal(calcularMultaAtraso(20, TOL), 3);  // 20 - 8 = 12 → tramo 2
  });

  test('regresa 30 min tarde (=22 sobre tol) → $4', () => {
    assert.equal(calcularMultaAtraso(30, TOL), 4);  // 30 - 8 = 22 → tramo 3
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. HORAS EXTRAS — calcularHorasExtrasDesdeConfig
// ════════════════════════════════════════════════════════════════════════════
describe('calcularHorasExtrasDesdeConfig', () => {
  const diaConfig = { salida: '17:30' };
  const DATE = '2026-07-15'; // martes cualquiera

  // Helper: convierte hora EC a UTC Date
  function ecUTC(dateStr: string, timeStr: string): Date {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, hh + 5, mm, 0));
  }

  test('fin 18:01 → 31 min → 0.52h exactas desde 17:30', () => {
    const finHora = ecUTC(DATE, '18:01');
    const { horas, detalleHorario } = calcularHorasExtrasDesdeConfig(diaConfig, finHora, DATE);
    assert.ok(horas > 0.51 && horas < 0.53, `esperado ~0.52 pero fue ${horas}`);
    assert.ok(detalleHorario.startsWith('17:30'), `detalleHorario: ${detalleHorario}`);
  });

  test('fin 18:30 → exactamente 1h', () => {
    const finHora = ecUTC(DATE, '18:30');
    const { horas } = calcularHorasExtrasDesdeConfig(diaConfig, finHora, DATE);
    assert.equal(horas, 1.0);
  });

  test('fin 19:00 → 1.5h exactas', () => {
    const finHora = ecUTC(DATE, '19:00');
    const { horas } = calcularHorasExtrasDesdeConfig(diaConfig, finHora, DATE);
    assert.equal(horas, 1.5);
  });

  test('fin ANTES de 17:30 → lanza error', () => {
    const finHora = ecUTC(DATE, '17:00');
    assert.throws(
      () => calcularHorasExtrasDesdeConfig(diaConfig, finHora, DATE),
      { message: /posterior a la salida programada/i }
    );
  });

  test('detalleHorario incluye "17:30" y la hora de fin', () => {
    const finHora = ecUTC(DATE, '18:45');
    const { detalleHorario } = calcularHorasExtrasDesdeConfig(diaConfig, finHora, DATE);
    assert.ok(detalleHorario.includes('17:30'), `got: ${detalleHorario}`);
    assert.ok(detalleHorario.includes('18:45'), `got: ${detalleHorario}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. REDONDEO A MEDIA HORA — redondearAMediaHora
// ════════════════════════════════════════════════════════════════════════════
describe('redondearAMediaHora', () => {
  test('0.34h → 0.5h (34 min se redondea a media hora)', () => {
    assert.equal(redondearAMediaHora(0.34), 0.5);
  });

  test('0.25h → 0.5h', () => {
    assert.equal(redondearAMediaHora(0.25), 0.5);
  });

  test('0.5h → 0.5h (sin cambio)', () => {
    assert.equal(redondearAMediaHora(0.5), 0.5);
  });

  test('0.74h → 0.5h', () => {
    assert.equal(redondearAMediaHora(0.74), 0.5);
  });

  test('0.76h → 1.0h', () => {
    assert.equal(redondearAMediaHora(0.76), 1.0);
  });

  test('1.0h → 1.0h', () => {
    assert.equal(redondearAMediaHora(1.0), 1.0);
  });

  test('1.3h → 1.5h', () => {
    assert.equal(redondearAMediaHora(1.3), 1.5);
  });

  test('1.58h (95 min) → 1.5h', () => {
    assert.equal(redondearAMediaHora(1.58), 1.5);
  });

  test('2.1h → 2.0h', () => {
    assert.equal(redondearAMediaHora(2.1), 2.0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. OPCIONES QR KIOSCO — getOpcionesMarcacion
// ════════════════════════════════════════════════════════════════════════════
describe('getOpcionesMarcacion — Tiempo Completo', () => {
  const diaConfig = { entrada: '08:00', inicioAlmuerzo: '13:00', finAlmuerzo: '14:00', salida: '17:30', almuerzoOpcional: false };

  function mockNow(timeStr: string) {
    // Override Date.now via passing diaConfig with currentMin baked in
    // We test the logic by checking what options are returned for given marks
  }

  test('sin marcaciones → solo [ENTRADA]', () => {
    // Sin importar la hora, si no hay marks → solo ENTRADA
    const opts = getOpcionesMarcacion([], 'Tiempo Completo', diaConfig);
    assert.equal(opts.length, 1);
    assert.equal(opts[0].tipo, 'ENTRADA');
  });

  test('con PERMISO → vacío (día completado)', () => {
    const opts = getOpcionesMarcacion([{ tipo: 'PERMISO' }], 'Tiempo Completo', diaConfig);
    assert.equal(opts.length, 0);
  });

  test('con SALIDA y FIN_HORAS_EXTRA → vacío (día completado)', () => {
    const opts = getOpcionesMarcacion([
      { tipo: 'ENTRADA' },
      { tipo: 'INICIO_ALMUERZO' },
      { tipo: 'FIN_ALMUERZO' },
      { tipo: 'SALIDA' },
      { tipo: 'FIN_HORAS_EXTRA' },
    ], 'Tiempo Completo', diaConfig);
    assert.equal(opts.length, 0);
  });

  test('con SALIDA_PERMISO → vacío (día completado)', () => {
    const opts = getOpcionesMarcacion([
      { tipo: 'ENTRADA' },
      { tipo: 'SALIDA_PERMISO' },
    ], 'Tiempo Completo', diaConfig);
    assert.equal(opts.length, 0);
  });
});

describe('getOpcionesMarcacion — Medio Día', () => {
  const diaConfig = { entrada: '08:00', inicioAlmuerzo: '13:00', finAlmuerzo: '14:00', salida: '17:30', almuerzoOpcional: false };

  test('Medio Día: tiene ENTRADA → siguiente es SALIDA (sin almuerzo)', () => {
    const opts = getOpcionesMarcacion([{ tipo: 'ENTRADA' }], 'Medio Día', diaConfig);
    // Medio Día only has ENTRADA → SALIDA, no lunch
    const tipos = opts.map(o => o.tipo);
    assert.ok(tipos.includes('SALIDA'), `opciones: ${tipos.join(', ')}`);
    assert.ok(!tipos.includes('INICIO_ALMUERZO'), 'Medio Día no debería tener almuerzo');
  });

  test('Medio Día con SALIDA → día completado', () => {
    const opts = getOpcionesMarcacion(
      [{ tipo: 'ENTRADA' }, { tipo: 'SALIDA' }],
      'Medio Día',
      diaConfig
    );
    assert.equal(opts.length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. CÁLCULO DE JORNADA ESPERADA (lógica del SALIDA_PERMISO)
// ════════════════════════════════════════════════════════════════════════════
describe('expectedShiftHours según diaConfig', () => {
  // Extraemos la lógica pura del SALIDA_PERMISO como función testeable
  function calcExpected(diaConfig: any, tipoContrato: string): number {
    let expectedShiftHours = 8;
    if (diaConfig?.entrada && diaConfig?.salida) {
      const [eh, em] = diaConfig.entrada.split(':').map(Number);
      const [sh, sm] = diaConfig.salida.split(':').map(Number);
      const rawMinutes = (sh * 60 + sm) - (eh * 60 + em);
      let lunchMinutes = 0;
      if (!diaConfig.almuerzoOpcional && diaConfig.inicioAlmuerzo && diaConfig.finAlmuerzo) {
        const [lih, lim] = diaConfig.inicioAlmuerzo.split(':').map(Number);
        const [lfh, lfm] = diaConfig.finAlmuerzo.split(':').map(Number);
        lunchMinutes = (lfh * 60 + lfm) - (lih * 60 + lim);
      }
      expectedShiftHours = Math.max(1, (rawMinutes - lunchMinutes) / 60);
    } else if (tipoContrato === 'Medio Día') {
      expectedShiftHours = 4;
    }
    return expectedShiftHours;
  }

  const SEMANA = {
    entrada: '08:00', inicioAlmuerzo: '13:00', finAlmuerzo: '14:00',
    salida: '17:30', almuerzoOpcional: false,
  };

  const SABADO = {
    entrada: '09:00', inicioAlmuerzo: null, finAlmuerzo: null,
    salida: '14:00', almuerzoOpcional: true,
  };

  const MEDIO_DIA_CFG = {
    entrada: '08:00', inicioAlmuerzo: null, finAlmuerzo: null,
    salida: '13:00', almuerzoOpcional: true,
  };

  test('Tiempo Completo lun–vie: 17:30 – 08:00 – 1h almuerzo = 8.5h', () => {
    const h = calcExpected(SEMANA, 'Tiempo Completo');
    assert.equal(h, 8.5);
  });

  test('Sábado: 14:00 – 09:00 sin almuerzo = 5h', () => {
    const h = calcExpected(SABADO, 'Tiempo Completo');
    assert.equal(h, 5);
  });

  test('Medio Día con config 08:00–13:00: 5h (no almuerzo)', () => {
    const h = calcExpected(MEDIO_DIA_CFG, 'Medio Día');
    assert.equal(h, 5);
  });

  test('Medio Día sin diaConfig → fallback a 4h', () => {
    const h = calcExpected(null, 'Medio Día');
    assert.equal(h, 4);
  });

  test('SALIDA_PERMISO: empleado TC que trabajó 6h → 2.5h pendientes', () => {
    const expected = calcExpected(SEMANA, 'Tiempo Completo'); // 8.5h
    const worked = 6;
    const remaining = Math.round(Math.max(0, expected - worked) * 100) / 100;
    assert.equal(remaining, 2.5);
  });

  test('SALIDA_PERMISO: empleado MD salió a las 13:00 (4h) → 0h pendientes', () => {
    const expected = calcExpected(MEDIO_DIA_CFG, 'Medio Día'); // 5h desde config
    const worked = 5;
    const remaining = Math.round(Math.max(0, expected - worked) * 100) / 100;
    assert.equal(remaining, 0); // sin descuento
  });

  test('SALIDA_PERMISO: sábado que trabajó 4h → 1h pendiente', () => {
    const expected = calcExpected(SABADO, 'Tiempo Completo'); // 5h
    const worked = 4;
    const remaining = Math.round(Math.max(0, expected - worked) * 100) / 100;
    assert.equal(remaining, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. NORMALIZACIÓN DE CONFIG — normalizeHorariosLaborales
// ════════════════════════════════════════════════════════════════════════════
describe('normalizeHorariosLaborales', () => {
  test('null/undefined → defaults', () => {
    const cfg = normalizeHorariosLaborales(null);
    assert.equal(cfg.toleranciaMinutos, DEFAULT_HORARIOS_LABORALES.toleranciaMinutos);
    assert.equal(cfg.valorHoraExtra, DEFAULT_HORARIOS_LABORALES.valorHoraExtra);
    assert.equal(cfg.valorMediaHoraExtra, DEFAULT_HORARIOS_LABORALES.valorMediaHoraExtra);
    assert.equal(cfg.semana.entrada, '08:00');
    assert.equal(cfg.semana.salida, '17:30');
  });

  test('toleranciaMinutos=10 se propaga', () => {
    const cfg = normalizeHorariosLaborales({ toleranciaMinutos: 10 });
    assert.equal(cfg.toleranciaMinutos, 10);
  });

  test('toleranciaMinutos negativo → se clampea a 0', () => {
    const cfg = normalizeHorariosLaborales({ toleranciaMinutos: -5 });
    assert.equal(cfg.toleranciaMinutos, 0);
  });

  test('valorHoraExtra=3.00 se propaga', () => {
    const cfg = normalizeHorariosLaborales({ valorHoraExtra: 3.0 });
    assert.equal(cfg.valorHoraExtra, 3.0);
  });

  test('valorMediaHoraExtra=2.00 se propaga', () => {
    const cfg = normalizeHorariosLaborales({ valorMediaHoraExtra: 2.0 });
    assert.equal(cfg.valorMediaHoraExtra, 2.0);
  });

  test('valores inválidos (NaN/null) → defaults', () => {
    const cfg = normalizeHorariosLaborales({ toleranciaMinutos: 'abc', valorHoraExtra: null });
    assert.equal(cfg.toleranciaMinutos, DEFAULT_HORARIOS_LABORALES.toleranciaMinutos);
    assert.equal(cfg.valorHoraExtra, DEFAULT_HORARIOS_LABORALES.valorHoraExtra);
  });

  test('semana entrada/salida personalizadas se preservan', () => {
    const cfg = normalizeHorariosLaborales({
      semana: { entrada: '09:00', salida: '18:00', inicioAlmuerzo: '13:00', finAlmuerzo: '14:00', almuerzoOpcional: false },
    });
    assert.equal(cfg.semana.entrada, '09:00');
    assert.equal(cfg.semana.salida, '18:00');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. VALOR SUGERIDO DE HORA EXTRA
// ════════════════════════════════════════════════════════════════════════════
describe('Cálculo de valor sugerido de horas extras', () => {
  function calcSugerido(horasExactas: number, valorMediaHora = 1.5): number {
    const redondeadas = redondearAMediaHora(horasExactas);
    const medias = redondeadas * 2;
    return Math.round(medias * valorMediaHora * 100) / 100;
  }

  test('31 min (0.517h) → 0.5h → $1.50', () => {
    assert.equal(calcSugerido(31 / 60), 1.5);
  });

  test('60 min (1.0h) → 1.0h → $3.00', () => {
    assert.equal(calcSugerido(1.0), 3.0);
  });

  test('90 min (1.5h) → 1.5h → $4.50', () => {
    assert.equal(calcSugerido(1.5), 4.5);
  });

  test('95 min (1.583h) → 1.5h → $4.50', () => {
    assert.equal(calcSugerido(95 / 60), 4.5);
  });

  test('120 min (2.0h) → 2.0h → $6.00', () => {
    assert.equal(calcSugerido(2.0), 6.0);
  });

  test('valorMediaHora=$2.00: 1h → $4.00', () => {
    assert.equal(calcSugerido(1.0, 2.0), 4.0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. ESCENARIOS INTEGRADOS (flujo completo sin DB)
// ════════════════════════════════════════════════════════════════════════════
describe('Escenarios end-to-end puros', () => {
  const TOL = 8;
  const HORA_EXTRA_MEDIA = 1.5;

  test('Escenario A: empleado puntual + horas extras 35min → $1.50', () => {
    const multaEntrada = calcularMultaAtraso(0, TOL);      // puntual
    const horasExtras = redondearAMediaHora(35 / 60);      // 0.5h
    const valorHE = horasExtras * 2 * HORA_EXTRA_MEDIA;    // $1.50

    assert.equal(multaEntrada, 0);
    assert.equal(horasExtras, 0.5);
    assert.equal(valorHE, 1.5);
  });

  test('Escenario B: atraso entrada $3 + almuerzo $2 = $5 total multas', () => {
    const multaEntrada = calcularMultaAtraso(17, TOL);    // 17 min → $3
    const multaAlmuerzo = calcularMultaAtraso(20, TOL);   // 20 min → $3? No 20-8=12 → tramo 2 $3
    // Corección: 20-8=12 → tramo 2 ($3), no $2
    // Recalculemos el escenario correcto para $5:
    // Entrada: 16 min → $2, Almuerzo: 16 min → $2... no suma $5
    // Escenario $5: Entrada 17 min → $3, Almuerzo 13 min → $2
    const multaEnt2 = calcularMultaAtraso(17, TOL);   // $3
    const multaAlm2 = calcularMultaAtraso(13, TOL);   // 13-8=5 → tramo 1 $2
    assert.equal(multaEnt2 + multaAlm2, 5);
  });

  test('Escenario C: Sábado, empleado 4h trabajadas, 1h restante', () => {
    // Sábado: 09:00 → 14:00 = 5h sin almuerzo
    const SABADO = { entrada: '09:00', inicioAlmuerzo: null, finAlmuerzo: null, salida: '14:00', almuerzoOpcional: true };
    const [eh, em] = SABADO.entrada.split(':').map(Number);
    const [sh, sm] = SABADO.salida.split(':').map(Number);
    const rawMin = (sh * 60 + sm) - (eh * 60 + em);
    const expectedH = rawMin / 60; // 5h
    const worked = 4;
    const remaining = Math.round(Math.max(0, expectedH - worked) * 100) / 100;
    assert.equal(expectedH, 5);
    assert.equal(remaining, 1);
  });

  test('Escenario D: Medio Día sale a su hora → 0 horas restantes', () => {
    const MEDIO_DIA = { entrada: '08:00', inicioAlmuerzo: null, finAlmuerzo: null, salida: '13:00', almuerzoOpcional: true };
    const [eh, em] = MEDIO_DIA.entrada.split(':').map(Number);
    const [sh, sm] = MEDIO_DIA.salida.split(':').map(Number);
    const expectedH = (sh * 60 + sm - eh * 60 - em) / 60; // 5h
    const worked = 5; // Exactamente su jornada
    const remaining = Math.round(Math.max(0, expectedH - worked) * 100) / 100;
    assert.equal(remaining, 0); // Sin descuento
  });

  test('Escenario E: horas extras sábado 60 min desde 14:00 → 1h → $3.00', () => {
    const diaConfig = { salida: '14:00' };
    const DATE = '2026-07-19'; // sábado
    const [y, mo, d] = DATE.split('-').map(Number);
    const [sh, sm] = diaConfig.salida.split(':').map(Number);
    // fin = 15:00 EC = 20:00 UTC
    const finHora = new Date(Date.UTC(y, mo - 1, d, sh + 5 + 1, sm, 0)); // +1h
    const { horas } = calcularHorasExtrasDesdeConfig(diaConfig, finHora, DATE);
    const redondeadas = redondearAMediaHora(horas);
    const valor = Math.round(redondeadas * 2 * 1.5 * 100) / 100;
    assert.equal(horas, 1.0);
    assert.equal(redondeadas, 1.0);
    assert.equal(valor, 3.0);
  });
});
