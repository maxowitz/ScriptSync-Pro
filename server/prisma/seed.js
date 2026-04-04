const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ------------------------------------------------------------------
  // 1. Create sample admin user
  // ------------------------------------------------------------------
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@scriptsyncpro.com' },
    update: {},
    create: {
      email: 'admin@scriptsyncpro.com',
      passwordHash,
      name: 'Admin User',
    },
  });

  console.log(`  User: ${admin.email} (${admin.id})`);

  // ------------------------------------------------------------------
  // 2. Create sample project
  // ------------------------------------------------------------------
  const project = await prisma.project.create({
    data: {
      name: 'Demo Film',
      ownerId: admin.id,
    },
  });

  console.log(`  Project: ${project.name} (${project.id})`);

  // ------------------------------------------------------------------
  // 3. Add user as OWNER member
  // ------------------------------------------------------------------
  await prisma.projectMember.create({
    data: {
      projectId: project.id,
      userId: admin.id,
      role: 'OWNER',
      acceptedAt: new Date(),
    },
  });

  console.log('  Member: admin -> OWNER');

  // ------------------------------------------------------------------
  // 4. Create sample screenplay with parsed JSON
  // ------------------------------------------------------------------
  const rawText = [
    'INT. OFFICE - DAY',
    '',
    'SARAH sits at her desk, reviewing footage on two monitors.',
    '',
    'SARAH',
    'The timecodes are off again. Every single take.',
    '',
    'JAMES enters, carrying a stack of scripts.',
    '',
    'JAMES',
    'I talked to post. They said the sync drifted during the overnight render.',
    '',
    'SARAH',
    'Great. So we resync everything manually?',
    '',
    'JAMES',
    'Or we use that new tool Marcus found.',
    '',
    'EXT. PARKING LOT - NIGHT',
    '',
    'Sarah walks to her car, phone pressed to her ear.',
    '',
    'SARAH',
    'Marcus, tell me this thing actually works.',
    '',
    'She unlocks the car and drops into the driver seat.',
    '',
    'SARAH (CONT\'D)',
    'Because I am not spending another weekend on manual sync.',
  ].join('\n');

  const parsedJSON = {
    scenes: [
      {
        id: 'scene-1',
        heading: 'INT. OFFICE - DAY',
        elements: [
          { type: 'action', text: 'SARAH sits at her desk, reviewing footage on two monitors.' },
          { type: 'dialogue', character: 'SARAH', text: 'The timecodes are off again. Every single take.' },
          { type: 'action', text: 'JAMES enters, carrying a stack of scripts.' },
          { type: 'dialogue', character: 'JAMES', text: 'I talked to post. They said the sync drifted during the overnight render.' },
          { type: 'dialogue', character: 'SARAH', text: 'Great. So we resync everything manually?' },
          { type: 'dialogue', character: 'JAMES', text: 'Or we use that new tool Marcus found.' },
        ],
      },
      {
        id: 'scene-2',
        heading: 'EXT. PARKING LOT - NIGHT',
        elements: [
          { type: 'action', text: 'Sarah walks to her car, phone pressed to her ear.' },
          { type: 'dialogue', character: 'SARAH', text: 'Marcus, tell me this thing actually works.' },
          { type: 'action', text: 'She unlocks the car and drops into the driver seat.' },
          { type: 'dialogue', character: 'SARAH', text: 'Because I am not spending another weekend on manual sync.' },
        ],
      },
    ],
  };

  const screenplay = await prisma.screenplay.create({
    data: {
      projectId: project.id,
      filename: 'demo-film-v1.fountain',
      rawText,
      parsedJSON,
      uploadedBy: admin.id,
    },
  });

  console.log(`  Screenplay: ${screenplay.filename} (${screenplay.id})`);

  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
