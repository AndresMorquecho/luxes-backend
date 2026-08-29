import { prisma } from '../../config/prismaClient.js';
import { sendPushToUsers, sendPushToRole } from './pushNotificationService.js';

const notifiedToday = new Set<string>();

export async function checkAndSendCalendarioNotifications(): Promise<void> {
  try {
    const ahora = new Date();
    const horaEcuadorStr = ahora.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Guayaquil',
    });
    const fechaEcuadorStr = ahora.toLocaleDateString('en-CA', {
      timeZone: 'America/Guayaquil',
    });

    const [currentH, currentM] = horaEcuadorStr.split(':').map(Number);
    const dayOfWeek = new Date(fechaEcuadorStr + 'T12:00:00Z').getUTCDay() || 7;

    // 1. Evaluar Rutinas del Día (08:30 AM)
    if (currentH === 8 && currentM >= 30 && currentM <= 35) {
      const rutinasKey = `rutinas_${fechaEcuadorStr}`;
      if (!notifiedToday.has(rutinasKey)) {
        notifiedToday.add(rutinasKey);

        const rutinas = await (prisma as any).rutina.findMany({
          where: { activo: true },
          include: {
            asignaciones: {
              include: {
                empleado: {
                  include: { user: true },
                },
              },
            },
          },
        });

        for (const r of rutinas) {
          let turnosPorDia: Record<string, string[]> = {};
          try {
            const parsed = JSON.parse(r.diasSemana || '{}');
            if (Array.isArray(parsed)) {
              const allEmpIds = r.asignaciones.map((a: any) => a.empleadoId);
              parsed.forEach((d: number) => { turnosPorDia[String(d)] = allEmpIds; });
            } else if (typeof parsed === 'object' && parsed !== null) {
              turnosPorDia = parsed;
            }
          } catch {
            turnosPorDia = {};
          }

          const assignedEmpIdsForToday = turnosPorDia[String(dayOfWeek)] || [];
          if (assignedEmpIdsForToday.length > 0) {
            const targetUsers = r.asignaciones
              .filter((a: any) => assignedEmpIdsForToday.includes(a.empleadoId))
              .map((a: any) => a.empleado?.user?.id)
              .filter(Boolean);

            if (targetUsers.length > 0) {
              await sendPushToUsers(targetUsers, {
                title: `Recordatorio de Turno: ${r.titulo}`,
                body: `Hoy te corresponde la rutina "${r.titulo}". Recuerda completarla en el sistema.`,
                data: { url: '/calendario' },
              }).catch((err) => console.error('[Push Rutina Error]', err));
            }
          }
        }
      }
    }

    // 2. Cumpleaños 1 Día Antes (09:00 AM)
    if (currentH === 9 && currentM >= 0 && currentM <= 5) {
      const bdayEveKey = `bday_eve_${fechaEcuadorStr}`;
      if (!notifiedToday.has(bdayEveKey)) {
        notifiedToday.add(bdayEveKey);

        const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
        const mananaMes = manana.getMonth() + 1;
        const mananaDia = manana.getDate();

        const empleados = await prisma.empleado.findMany({
          where: { fechaNacimiento: { not: null } },
          select: { id: true, nombre: true, fechaNacimiento: true },
        });

        for (const emp of empleados) {
          if (emp.fechaNacimiento) {
            const b = new Date(emp.fechaNacimiento);
            if (b.getUTCMonth() + 1 === mananaMes && b.getUTCDate() === mananaDia) {
              const edad = manana.getFullYear() - b.getUTCFullYear();
              await sendPushToRole('admin', {
                title: `Mañana es el cumpleaños de ${emp.nombre}`,
                body: `Cumplirá ${edad > 0 ? edad + ' años' : ''}. ¡Prepárale una felicitación!`,
                data: { url: '/calendario' },
              }).catch((err) => console.error('[Push Bday Eve Error]', err));
            }
          }
        }
      }
    }

    // 3. Cumpleaños Hoy (08:00 AM)
    if (currentH === 8 && currentM >= 0 && currentM <= 5) {
      const bdayTodayKey = `bday_today_${fechaEcuadorStr}`;
      if (!notifiedToday.has(bdayTodayKey)) {
        notifiedToday.add(bdayTodayKey);

        const hoyMes = ahora.getMonth() + 1;
        const hoyDia = ahora.getDate();

        const empleados = await prisma.empleado.findMany({
          where: { fechaNacimiento: { not: null } },
          select: { id: true, nombre: true, fechaNacimiento: true },
        });

        for (const emp of empleados) {
          if (emp.fechaNacimiento) {
            const b = new Date(emp.fechaNacimiento);
            if (b.getUTCMonth() + 1 === hoyMes && b.getUTCDate() === hoyDia) {
              await sendPushToRole('admin', {
                title: `Hoy está de cumpleaños ${emp.nombre}`,
                body: `¡Feliz cumpleaños ${emp.nombre}! De parte de todo el equipo de Luxes.`,
                data: { url: '/calendario' },
              }).catch((err) => console.error('[Push Bday Today Error]', err));
            }
          }
        }
      }
    }

    if (currentH === 0 && notifiedToday.size > 20) {
      notifiedToday.clear();
    }
  } catch (error) {
    console.error('[Calendario Scheduler Error]', error);
  }
}

export function startCalendarioScheduler(): void {
  setInterval(() => {
    checkAndSendCalendarioNotifications().catch((err) =>
      console.error('[Calendario Scheduler Interval Error]', err)
    );
  }, 60 * 1000);

  checkAndSendCalendarioNotifications().catch((err) =>
    console.error('[Calendario Scheduler Initial Error]', err)
  );
}
