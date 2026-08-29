export class CalendarioController {
    service;
    constructor(service) {
        this.service = service;
    }
    async getEventos(req, res) {
        try {
            const mesParam = req.query.mes || new Date().toISOString().slice(0, 7);
            const data = await this.service.getEventosDelMes(mesParam);
            return res.json({ success: true, data });
        }
        catch (e) {
            return res.status(500).json({ success: false, error: { message: e.message } });
        }
    }
}
