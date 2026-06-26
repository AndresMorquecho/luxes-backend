import { prisma } from './config/prismaClient.js';
async function main() {
    console.log('--- CLIENTES ---');
    const clientes = await prisma.cliente.findMany();
    console.log(clientes);
    console.log('--- PROFORMAS ---');
    const proformas = await prisma.proforma.findMany();
    console.log(proformas.map(p => ({ id: p.id, clienteId: p.clienteId, clienteNombre: p.clienteNombre, estado: p.estado })));
    console.log('--- PROYECTOS ---');
    const proyectos = await prisma.proyecto.findMany();
    console.log(proyectos.map(p => ({ id: p.id, nombre: p.nombre, clienteId: p.clienteId, clienteNombre: p.clienteNombre, estado: p.estado })));
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
