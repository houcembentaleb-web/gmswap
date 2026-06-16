import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: hashedPassword,
      isAdmin: true,
      isVerified: true,
    },
  });

  console.log(`✅ Created admin: ${admin.username}`);

  // Create test users
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'seller@example.com' },
      update: {},
      create: {
        username: 'seller',
        email: 'seller@example.com',
        passwordHash: hashedPassword,
        isVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'buyer@example.com' },
      update: {},
      create: {
        username: 'buyer',
        email: 'buyer@example.com',
        passwordHash: hashedPassword,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} test users`);

  // Create sample listings
  const listings = await prisma.listing.createMany({
    data: [
      {
        userId: users[0].id,
        title: 'FIFA 25 - PS5 (Neuf)',
        description: 'Jeu FIFA 25, boîte scellée, jamais ouvert',
        category: 'GAME',
        platform: 'PS5',
        condition: 'NEW',
        price: 149.99,
        isNegotiable: true,
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        publishedAt: new Date(),
        slug: 'fifa-25-ps5-neuf',
        location: 'Tunis',
        city: 'Tunis',
        country: 'Tunisia',
      },
      {
        userId: users[0].id,
        title: 'Nintendo Switch OLED + Zelda',
        description: 'Console comme neuve, avec boîte et chargeur',
        category: 'CONSOLE',
        platform: 'SWITCH',
        condition: 'LIKE_NEW',
        price: 799.99,
        isNegotiable: true,
        acceptsSwap: true,
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        publishedAt: new Date(),
        slug: 'nintendo-switch-oled-zelda',
        location: 'Sousse',
        city: 'Sousse',
        country: 'Tunisia',
      },
      {
        userId: users[1].id,
        title: 'God of War Ragnarok (PS5)',
        description: 'Excellent état, fini une fois',
        category: 'GAME',
        platform: 'PS5',
        condition: 'GOOD',
        price: 89.99,
        isNegotiable: true,
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        publishedAt: new Date(),
        slug: 'god-of-war-ragnarok-ps5',
        location: 'Tunis',
        city: 'Tunis',
        country: 'Tunisia',
      },
    ],
  });

  console.log(`✅ Created ${listings.count} listings`);
  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });