import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Prisma select broker with lowest count

  const broker = await prisma.game.groupBy({
    select: {
      broker: true,
    },
    orderBy: {
      _count: {
        broker: "asc",
      },
    },
    take: 1,
    by: ["broker"],
  });
  console.log(broker);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
