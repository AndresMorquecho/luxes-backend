import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';

const CONFIG_ID = 'default';

/** Condiciones de pago precargadas por defecto la primera vez */
const DEFAULT_CONDICIONES = [
  '60% de anticipo y 40% contra entrega, efectivo o transferencias bancarias',
  'Entrega en 15 días hábiles después de la confirmación de diseño',
  'Esta cotización es válida por 3 días después de su fecha de emisión',
  'Nuestros productos cuentan con garantía mínimo de 12 meses, no cubre daños por mal uso o instalación incorrecta',
].join('\n');

export class ConfiguracionController {
  /** Devuelve la configuración; la crea con valores por defecto si aún no existe */
  async get(_req: Request, res: Response): Promise<Response> {
    try {
      let config = await prisma.configuracion.findUnique({ where: { id: CONFIG_ID } });
      if (!config) {
        config = await prisma.configuracion.create({
          data: {
            id: CONFIG_ID,
            condicionesPago: DEFAULT_CONDICIONES,
            celular: '',
            email: '',
            direccion: '',
            diasValidez: 3,
          },
        });
      }
      return res.status(200).json({ success: true, data: config });
    } catch (error) {
      console.error('[configuracion/get]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener la configuración' } });
    }
  }

  /** Crea o actualiza la configuración (singleton) */
  async update(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      const data = {
        condicionesPago: b.condicionesPago ?? '',
        celular: b.celular ?? '',
        email: b.email ?? '',
        direccion: b.direccion ?? '',
        diasValidez: Number(b.diasValidez ?? 3),
      };
      const config = await prisma.configuracion.upsert({
        where: { id: CONFIG_ID },
        update: data,
        create: { id: CONFIG_ID, ...data },
      });
      return res.status(200).json({ success: true, data: config });
    } catch (error) {
      console.error('[configuracion/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al guardar la configuración' } });
    }
  }
}
