import { prisma } from '../../../../config/prismaClient.js';
const formatFotoUrl = (empId, foto) => {
    if (!foto)
        return null;
    const trimmed = foto.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith('data:image/')) {
        return `/api/empleados/${empId}/foto`;
    }
    return trimmed;
};
export class CalendarioService {
    async getEventosDelMes(mes) {
        const [yearStr, monthStr] = mes.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59));
        const daysInMonth = endOfMonth.getUTCDate();
        const eventos = [];
        // 1. Proyectos
        const proyectos = await prisma.proyecto.findMany({
            where: {
                fechaEntregaEstimada: {
                    gte: startOfMonth,
                    lte: endOfMonth,
                },
                estado: { not: 'CANCELADO' },
            },
            include: { cliente: true },
        });
        for (const p of proyectos) {
            if (p.fechaEntregaEstimada) {
                const fechaStr = p.fechaEntregaEstimada.toISOString().split('T')[0];
                eventos.push({
                    id: `proy-${p.id}`,
                    titulo: p.nombre,
                    subtitulo: `Cliente: ${p.cliente?.nombre || p.clienteNombre || 'General'} • Fase: ${p.faseActual}`,
                    categoria: 'proyecto',
                    fecha: fechaStr,
                    color: '#2563eb',
                    badge: p.faseActual,
                    estado: p.estado,
                    url: `/proyectos/${p.id}`,
                    metadata: {
                        proyectoId: p.id,
                        cliente: p.cliente?.nombre || p.clienteNombre,
                        monto: Number(p.montoEstimado || 0),
                        responsable: p.responsable,
                    },
                });
            }
        }
        // 2. Instalaciones
        const instalaciones = await prisma.proyectoInstalacion.findMany({
            where: {
                fechaInstalacion: {
                    gte: startOfMonth,
                    lte: endOfMonth,
                },
            },
            include: {
                proyecto: { select: { id: true, nombre: true, clienteNombre: true } },
                personalAsignado: { include: { empleado: { select: { id: true, nombre: true, foto: true } } } },
            },
        });
        for (const inst of instalaciones) {
            if (inst.fechaInstalacion) {
                const fechaStr = inst.fechaInstalacion.toISOString().split('T')[0];
                const instaladores = inst.personalAsignado.map((p) => p.empleado.nombre).join(', ');
                eventos.push({
                    id: `inst-${inst.id}`,
                    titulo: `Instalación: ${inst.proyecto.nombre}`,
                    subtitulo: `Lugar: ${inst.direccionInstalacion || 'En sitio'} ${instaladores ? '• ' + instaladores : ''}`,
                    categoria: 'instalacion',
                    fecha: fechaStr,
                    color: '#0b2d64',
                    badge: inst.instalacionCompletada ? 'COMPLETADA' : 'PROGRAMADA',
                    url: `/proyectos/${inst.proyectoId}`,
                    metadata: {
                        proyectoId: inst.proyectoId,
                        direccion: inst.direccionInstalacion,
                        completada: inst.instalacionCompletada,
                    },
                });
            }
        }
        // 3. Cumpleaños
        const empleados = await prisma.empleado.findMany({
            where: {
                fechaNacimiento: { not: null },
            },
            select: {
                id: true,
                nombre: true,
                foto: true,
                fechaNacimiento: true,
            },
        });
        for (const emp of empleados) {
            if (emp.fechaNacimiento) {
                const birth = new Date(emp.fechaNacimiento);
                const birthMonth = birth.getUTCMonth() + 1;
                const birthDay = birth.getUTCDate();
                if (birthMonth === month) {
                    const birthYear = birth.getUTCFullYear();
                    const edad = year - birthYear;
                    const dayStr = String(birthDay).padStart(2, '0');
                    const monthStrPadded = String(month).padStart(2, '0');
                    const fechaCumple = `${year}-${monthStrPadded}-${dayStr}`;
                    eventos.push({
                        id: `cumple-${emp.id}-${fechaCumple}`,
                        titulo: `Cumpleaños de ${emp.nombre}`,
                        subtitulo: edad > 0 ? `Cumple ${edad} años` : 'Cumpleaños',
                        categoria: 'cumpleanos',
                        fecha: fechaCumple,
                        color: '#d97706',
                        badge: edad > 0 ? `${edad} años` : 'Cumpleaños',
                        url: `/nomina/empleados/${emp.id}`,
                        metadata: {
                            empleadoId: emp.id,
                            nombre: emp.nombre,
                            foto: formatFotoUrl(emp.id, emp.foto),
                            edad,
                        },
                    });
                }
            }
        }
        // 4. Cheques Posfechados
        const cheques = await prisma.chequeCompra.findMany({
            where: {
                fechaCobro: {
                    gte: startOfMonth,
                    lte: endOfMonth,
                },
            },
            include: {
                ordenCompra: { include: { proveedor: true } },
                metodoPago: true,
            },
        });
        for (const ch of cheques) {
            const fechaStr = ch.fechaCobro.toISOString().split('T')[0];
            const provNombre = ch.ordenCompra?.proveedor?.nombre || 'Proveedor';
            eventos.push({
                id: `cheque-${ch.id}`,
                titulo: `Cheque N° ${ch.numeroCheque}: $${Number(ch.monto || 0).toFixed(2)}`,
                subtitulo: `${provNombre} • Cuenta: ${ch.metodoPago?.nombre || 'Banco'}`,
                categoria: 'cheque',
                fecha: fechaStr,
                color: '#059669',
                badge: ch.estado === 'PROCESADO' ? 'COBRADO' : 'PENDIENTE',
                url: '/compras/cuentas-por-pagar',
                metadata: {
                    numeroCheque: ch.numeroCheque,
                    monto: ch.monto,
                    proveedor: provNombre,
                    estado: ch.estado,
                },
            });
        }
        // 5. Gastos Fijos
        const gastosFijos = await prisma.gastoFijo.findMany({
            where: { activo: true },
            include: { metodoPago: true },
        });
        for (const gf of gastosFijos) {
            let dayToUse = gf.diaVencimiento || 1;
            if (dayToUse > daysInMonth)
                dayToUse = daysInMonth;
            const dayStr = String(dayToUse).padStart(2, '0');
            const monthStrPadded = String(month).padStart(2, '0');
            const fechaGasto = `${year}-${monthStrPadded}-${dayStr}`;
            eventos.push({
                id: `gastofijo-${gf.id}-${fechaGasto}`,
                titulo: `Gasto Fijo: ${gf.nombre}`,
                subtitulo: `Est. $${Number(gf.montoEstimado || 0).toFixed(2)} • ${gf.proveedor || gf.categoria}`,
                categoria: 'gasto_fijo',
                fecha: fechaGasto,
                color: '#e11d48',
                badge: `$${Number(gf.montoEstimado || 0).toFixed(2)}`,
                url: '/gastos/fijos',
                metadata: {
                    gastoFijoId: gf.id,
                    montoEstimado: gf.montoEstimado,
                    frecuencia: gf.frecuencia,
                },
            });
        }
        // 6. Mantenimientos
        const mantenimientos = await prisma.vehiculoMantenimiento.findMany({
            where: {
                fechaProxima: {
                    gte: startOfMonth,
                    lte: endOfMonth,
                },
            },
            include: { vehiculo: true },
        });
        for (const m of mantenimientos) {
            if (m.fechaProxima) {
                const fechaStr = m.fechaProxima.toISOString().split('T')[0];
                eventos.push({
                    id: `mant-${m.id}`,
                    titulo: `Mantenimiento: ${m.vehiculo?.placa || 'Vehículo'}`,
                    subtitulo: `Tipo: ${m.tipo} ${m.kmProximo ? '• ' + m.kmProximo + ' km' : ''}`,
                    categoria: 'mantenimiento',
                    fecha: fechaStr,
                    color: '#d97706',
                    badge: m.tipo,
                    url: '/gastos/vehiculos',
                    metadata: {
                        vehiculoId: m.vehiculoId,
                        placa: m.vehiculo?.placa,
                        tipo: m.tipo,
                    },
                });
            }
        }
        // 7. Rutinas Recurrentes con turnos específicos por día
        const rutinas = await prisma.rutina.findMany({
            where: { activo: true },
            include: {
                asignaciones: { include: { empleado: { select: { id: true, nombre: true, foto: true } } } },
                historial: {
                    where: {
                        fecha: {
                            gte: startOfMonth,
                            lte: endOfMonth,
                        },
                    },
                },
            },
        });
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(Date.UTC(year, month - 1, day));
            const dayOfWeek = currentDate.getUTCDay() === 0 ? 7 : currentDate.getUTCDay();
            const dayStr = String(day).padStart(2, '0');
            const monthStrPadded = String(month).padStart(2, '0');
            const fechaStr = `${year}-${monthStrPadded}-${dayStr}`;
            for (const r of rutinas) {
                let turnosPorDia = {};
                try {
                    const parsed = JSON.parse(r.diasSemana || '{}');
                    if (Array.isArray(parsed)) {
                        const allEmpIds = r.asignaciones.map((a) => a.empleadoId);
                        parsed.forEach((d) => { turnosPorDia[String(d)] = allEmpIds; });
                    }
                    else if (typeof parsed === 'object' && parsed !== null) {
                        turnosPorDia = parsed;
                    }
                }
                catch {
                    turnosPorDia = {};
                }
                const assignedEmpIdsForDay = turnosPorDia[String(dayOfWeek)] || [];
                const hasAssignmentForToday = assignedEmpIdsForDay.length > 0;
                if (hasAssignmentForToday) {
                    const hist = r.historial.find((h) => h.fecha.toISOString().split('T')[0] === fechaStr);
                    const completada = hist ? Boolean(hist.completada) : false;
                    // Resolve employees for this specific day with formatted foto
                    const assignedEmpsForDay = r.asignaciones
                        .filter((a) => assignedEmpIdsForDay.includes(a.empleado.id))
                        .map((a) => ({
                        id: a.empleado.id,
                        nombre: a.empleado.nombre,
                        foto: formatFotoUrl(a.empleado.id, a.empleado.foto),
                    }));
                    const activeEmps = assignedEmpsForDay.length > 0
                        ? assignedEmpsForDay
                        : r.asignaciones.map((a) => ({
                            id: a.empleado.id,
                            nombre: a.empleado.nombre,
                            foto: formatFotoUrl(a.empleado.id, a.empleado.foto),
                        }));
                    const empleadosNom = activeEmps.map((e) => e.nombre).join(', ');
                    eventos.push({
                        id: `rutina-${r.id}-${fechaStr}`,
                        titulo: r.titulo,
                        subtitulo: empleadosNom ? `Turno: ${empleadosNom}` : 'Sin colaboradores asignados',
                        categoria: 'rutina',
                        fecha: fechaStr,
                        hora: r.horaNotificacion || '08:30',
                        color: '#0b2d64',
                        badge: completada ? 'COMPLETADA' : 'PENDIENTE',
                        completado: completada,
                        metadata: {
                            rutinaId: r.id,
                            hora: r.horaNotificacion,
                            empleados: activeEmps,
                            completada,
                            notas: hist?.notas,
                        },
                    });
                }
            }
        }
        eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
        const resumen = {};
        for (const e of eventos) {
            resumen[e.categoria] = (resumen[e.categoria] || 0) + 1;
        }
        resumen.total = eventos.length;
        return { eventos, resumen };
    }
}
