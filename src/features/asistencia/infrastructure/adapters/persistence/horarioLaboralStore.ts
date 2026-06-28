import { prisma } from '../../../../../config/prismaClient.js';
import {
  DEFAULT_HORARIOS_LABORALES,
  getHorarioEsperado,
  getHorarioLabel,
  getDiaConfig,
  normalizeHorariosLaborales,
  type HorariosLaboralesConfig,
} from '../../../../../shared/utils/horarioLaboralHelpers.js';

const CONFIG_ID = 'default';

export async function loadHorariosLaborales(): Promise<HorariosLaboralesConfig> {
  const config = await prisma.configuracion.findUnique({ where: { id: CONFIG_ID } });
  return normalizeHorariosLaborales(config?.horariosLaborales ?? null);
}

export async function saveHorariosLaborales(data: unknown): Promise<HorariosLaboralesConfig> {
  const normalized = normalizeHorariosLaborales(data);

  await prisma.configuracion.upsert({
    where: { id: CONFIG_ID },
    update: { horariosLaborales: normalized as object },
    create: {
      id: CONFIG_ID,
      horariosLaborales: normalized as object,
      condicionesPago: '',
      celular: '',
      email: '',
      direccion: '',
      diasValidez: 3,
    },
  });

  return normalized;
}

export async function getHorarioDelDia(fecha: string) {
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
