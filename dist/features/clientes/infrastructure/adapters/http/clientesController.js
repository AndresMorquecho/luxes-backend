import { prisma } from '../../../../../config/prismaClient.js';
/** Genera el siguiente ID con formato PREFIJO-### (ej. CLI-001) */
async function nextClienteId() {
    const rows = await prisma.cliente.findMany({ select: { id: true } });
    const max = rows.reduce((m, r) => {
        const n = parseInt(String(r.id).replace('CLI-', ''), 10);
        return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `CLI-${String(max + 1).padStart(3, '0')}`;
}
export class ClientesController {
    async list(_req, res) {
        try {
            const clientes = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
            return res.status(200).json({ success: true, data: clientes });
        }
        catch (error) {
            console.error('[clientes/list]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener clientes' } });
        }
    }
    async create(req, res) {
        try {
            const b = req.body || {};
            if (!b.nombre) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El nombre es requerido' } });
            }
            const id = b.id && String(b.id).startsWith('CLI-') ? b.id : await nextClienteId();
            const cliente = await prisma.cliente.create({
                data: {
                    id,
                    nombre: b.nombre,
                    cedulaRuc: b.cedulaRuc ?? '',
                    telefono: b.telefono ?? '',
                    email: b.email ?? '',
                    direccion: b.direccion ?? '',
                    tipo: b.tipo ?? 'Persona',
                    notas: b.notas ?? '',
                },
            });
            return res.status(201).json({ success: true, data: cliente });
        }
        catch (error) {
            console.error('[clientes/create]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al crear cliente' } });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const b = req.body || {};
            const cliente = await prisma.cliente.update({
                where: { id: String(id) },
                data: {
                    nombre: b.nombre,
                    cedulaRuc: b.cedulaRuc,
                    telefono: b.telefono,
                    email: b.email,
                    direccion: b.direccion,
                    tipo: b.tipo,
                    notas: b.notas,
                },
            });
            return res.status(200).json({ success: true, data: cliente });
        }
        catch (error) {
            console.error('[clientes/update]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar cliente' } });
        }
    }
    async remove(req, res) {
        try {
            const { id } = req.params;
            await prisma.cliente.delete({ where: { id: String(id) } });
            return res.status(200).json({ success: true, data: { id } });
        }
        catch (error) {
            console.error('[clientes/remove]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar cliente' } });
        }
    }
}
