import { processPurchaseCheque } from './compraPayments.js';
import { prisma } from '../../config/prismaClient.js';
import { sendPushToRole } from './pushNotificationService.js';

const CUENTAS_POR_PAGAR_URL = '/compras/cuentas-por-pagar';

const fmt = (n: number) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Verifica y procesa los cheques posfechados pendientes que hayan alcanzado su fecha de cobro.
 * Genera el egreso contable en banco y notifica al Administrador.
 */
export async function procesarChequesVencidos(): Promise<void> {
  try {
    const chequesVencidos = await (prisma as any).chequeCompra.findMany({
      where: {
        estado: 'PENDIENTE',
        procesado: false,
        fechaCobro: { lte: new Date() },
      },
      include: {
        ordenCompra: { include: { proveedor: true } },
        metodoPago: true,
      },
    });

    if (!chequesVencidos || chequesVencidos.length === 0) return;

    console.log(`[Cheques Scheduler] Procesando ${chequesVencidos.length} cheque(s) vencido(s)...`);

    for (const cheque of chequesVencidos) {
      try {
        const processed = await processPurchaseCheque(prisma, cheque.id);
        if (processed.estado !== 'PROCESADO') continue;

        // 4. Notificar In-App y Push al Administrador
        const title = `Cobro de Cheque Programado: N° ${cheque.numeroCheque}`;
        const cuentaNombre = cheque.metodoPago?.nombre || 'Cuenta de Pago';
        const ordenNumero = cheque.ordenCompra?.numero || '';
        const message = `El cheque N° ${cheque.numeroCheque} por ${fmt(cheque.monto)} de la cuenta "${cuentaNombre}" para la orden ${ordenNumero} ha sido cobrado/debitado automáticamente.`;

        // 4. Notificar In-App y Push al Administrador (Única notificación sin duplicados)
        const notifExistente = await prisma.notification.findFirst({
          where: {
            title,
            message: { contains: cheque.numeroCheque },
          },
        });

        if (!notifExistente) {
          await prisma.notification.create({
            data: {
              title,
              message,
              rol: 'admin',
              createdBy: 'Sistema de Cheques Posfechados',
            },
          });

          await sendPushToRole('admin', {
            title,
            body: message,
            data: { url: CUENTAS_POR_PAGAR_URL },
          }).catch((err) => console.error('[Cheques Push Error]', err));
        }

        console.log(`[Cheques Scheduler] Cheque N° ${cheque.numeroCheque} por ${fmt(cheque.monto)} procesado con éxito.`);
      } catch (chequeErr) {
        console.error(`[Cheques Scheduler Error] Fallo al procesar cheque ${cheque.id}:`, chequeErr);
      }
    }
  } catch (error) {
    console.error('[Cheques Scheduler Error Global]', error);
  }
}

/**
 * Inicia la verificación automática de cheques posfechados.
 * Aplica arquitectura Event-Driven + Cron diario a medianoche (00:00:00).
 */
export function startChequesScheduler(): void {
  // 1. Verificación inicial al arrancar el servidor
  procesarChequesVencidos().catch((err) => console.error('[Cheques Initial Check Error]', err));

  // 2. Programar verificación diaria a la medianoche (00:00:00)
  const ahora = new Date();
  const proximaMedianoche = new Date(ahora);
  proximaMedianoche.setDate(proximaMedianoche.getDate() + 1);
  proximaMedianoche.setHours(0, 0, 1, 0); // 00:00:01 AM

  const msHastaMedianoche = proximaMedianoche.getTime() - ahora.getTime();

  setTimeout(() => {
    procesarChequesVencidos().catch((err) => console.error('[Cheques Midnight Check Error]', err));
    // Ejecutar cada 24 horas a partir de medianoche
    setInterval(() => {
      procesarChequesVencidos().catch((err) => console.error('[Cheques Daily Check Error]', err));
    }, 24 * 60 * 60 * 1000);
  }, msHastaMedianoche);
}
