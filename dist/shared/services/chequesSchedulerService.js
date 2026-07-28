import { prisma } from '../../config/prismaClient.js';
import { sendPushToRole } from './pushNotificationService.js';
const CUENTAS_POR_PAGAR_URL = '/compras/cuentas-por-pagar';
const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/**
 * Verifica y procesa los cheques posfechados pendientes que hayan alcanzado su fecha de cobro.
 * Genera el egreso contable en banco y notifica al Administrador.
 */
export async function procesarChequesVencidos() {
    try {
        const chequesVencidos = await prisma.chequeCompra.findMany({
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
        if (!chequesVencidos || chequesVencidos.length === 0)
            return;
        console.log(`[Cheques Scheduler] Procesando ${chequesVencidos.length} cheque(s) vencido(s)...`);
        for (const cheque of chequesVencidos) {
            try {
                // 1. Crear el abono de egreso contable en la BD
                const abonoExistente = await prisma.abonoCompra.findFirst({
                    where: {
                        ordenCompraId: cheque.ordenCompraId,
                        monto: cheque.monto,
                        referencia: { contains: cheque.numeroCheque },
                    },
                });
                if (!abonoExistente) {
                    await prisma.abonoCompra.create({
                        data: {
                            ordenCompraId: cheque.ordenCompraId,
                            metodoPagoId: cheque.metodoPagoId,
                            monto: cheque.monto,
                            referencia: cheque.referencia || `Cobro Cheque N° ${cheque.numeroCheque}`,
                            registradoPorUserId: cheque.registradoPorUserId || null,
                        },
                    });
                }
                // 2. Marcar cheque como PROCESADO
                await prisma.chequeCompra.update({
                    where: { id: cheque.id },
                    data: {
                        estado: 'PROCESADO',
                        procesado: true,
                        notificado: true,
                    },
                });
                // 3. Recalcular EXACTAMENTE el saldo y montoPagado de la CuentaPorPagar sumando TODOS los abonos reales
                const abonosSum = await prisma.abonoCompra.aggregate({
                    where: { ordenCompraId: cheque.ordenCompraId },
                    _sum: { monto: true },
                });
                const cxp = await prisma.cuentaPorPagar.findUnique({
                    where: { ordenCompraId: cheque.ordenCompraId },
                });
                if (cxp) {
                    const totalPagado = abonosSum._sum.monto || 0;
                    const newSaldo = Math.max(0, cxp.montoTotal - totalPagado);
                    const newEstado = newSaldo <= 0 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente';
                    const newEstadoPago = newEstado === 'pagado' ? 'pagado' : totalPagado > 0 ? 'parcial' : 'sin_pagar';
                    await prisma.cuentaPorPagar.update({
                        where: { id: cxp.id },
                        data: {
                            montoPagado: totalPagado,
                            saldo: newSaldo,
                            estado: newEstado,
                        },
                    });
                    await prisma.ordenCompra.update({
                        where: { id: cheque.ordenCompraId },
                        data: { estadoPago: newEstadoPago },
                    });
                }
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
            }
            catch (chequeErr) {
                console.error(`[Cheques Scheduler Error] Fallo al procesar cheque ${cheque.id}:`, chequeErr);
            }
        }
    }
    catch (error) {
        console.error('[Cheques Scheduler Error Global]', error);
    }
}
/**
 * Inicia la verificación automática de cheques posfechados.
 * Aplica arquitectura Event-Driven + Cron diario a medianoche (00:00:00).
 */
export function startChequesScheduler() {
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
