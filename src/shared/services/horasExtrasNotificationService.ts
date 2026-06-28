import { prisma } from '../../config/prismaClient.js';
import { sendPushToRole } from './pushNotificationService.js';

const HORAS_EXTRAS_URL = '/nomina/horas-extras';

function canonicalRole(rol: string): string {
  const r = rol.toLowerCase();
  if (r === 'administrador') return 'admin';
  return r;
}

export async function notifyHorasExtrasPendiente(data: {
  colaboradorNombre: string;
  horas: number;
  total: number;
  fecha: string;
  detalleHorario?: string;
  createdBy?: string;
}): Promise<void> {
  const title = 'Horas extras por aprobar';
  const horario = data.detalleHorario ? ` · ${data.detalleHorario}` : '';
  const message = `${data.colaboradorNombre} registró ${data.horas} h extras el ${data.fecha}${horario} — total $${data.total.toFixed(2)}. Requiere aprobación en nómina.`;
  const createdBy = data.createdBy || 'Quiosco de asistencia';

  const roles = ['admin', 'administrador'];
  const seen = new Set<string>();

  try {
    for (const roleName of roles) {
      const canon = canonicalRole(roleName);
      if (seen.has(canon)) continue;
      seen.add(canon);

      await prisma.notification.create({
        data: {
          title,
          message,
          rol: canon,
          createdBy,
        },
      });

      await sendPushToRole(canon, {
        title,
        body: message,
        data: { url: HORAS_EXTRAS_URL },
      }).catch((err) => {
        console.error('[notifyHorasExtrasPendiente] push error:', err);
      });
    }
  } catch (err) {
    console.error('[notifyHorasExtrasPendiente]', err);
  }
}
