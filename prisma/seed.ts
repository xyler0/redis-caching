import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const userRole = await prisma.role.create({
    data: { name: 'user', description: 'Regular user' },
  });

  const adminRole = await prisma.role.create({
    data: { name: 'admin', description: 'Administrator' },
  });

  // Create 1000 users for realistic load
  const users = [];
  for (let i = 0; i < 1000; i++) {
    users.push({
      email: `user${i}@example.com`,
      name: `User ${i}`,
      bio: `Biography for user ${i}`,
      roleId: i % 10 === 0 ? adminRole.id : userRole.id,
    });
  }

  await prisma.user.createMany({ data: users });

  console.log('✅ Created 1000 users');
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });