import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    // Eliminar todas las asistencias en la base de datos
    const deleteResult = await prisma.asistencia.deleteMany({});
    console.log('Se eliminaron exitosamente todas las asistencias de la base de datos. Cantidad:', deleteResult.count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
