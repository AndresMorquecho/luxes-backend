import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.ingresoDetalle.findMany({ orderBy: { fecha: "desc" }, take: 20 });
  console.log(JSON.stringify(r, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
