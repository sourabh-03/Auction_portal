import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function randomPassword(): string {
  // 12 chars, alphanumeric — easy to read/type back for a demo login.
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

async function main() {
  const teamPasswordHash = await bcrypt.hash('password123', 10);

  const team = await prisma.auctionTeamUser.upsert({
    where: { email: 'ritu.menon@procease.local' },
    update: {},
    create: {
      name: 'Ritu Menon',
      email: 'ritu.menon@procease.local',
      passwordHash: teamPasswordHash,
    },
  });

  const vendorSeed = [
    { slug: 'bharatbearings', companyName: 'Bharat Bearings & Components', city: 'Mumbai', category: 'Mechanical Spares' },
    { slug: 'precisionrotodyne', companyName: 'Precision Rotodyne Pvt Ltd', city: 'Pune', category: 'Mechanical Spares' },
    { slug: 'anandengg', companyName: 'Anand Engineering Works', city: 'Ahmedabad', category: 'Mechanical Spares' },
    { slug: 'konkanindustrial', companyName: 'Konkan Industrial Traders', city: 'Vapi', category: 'Mechanical Spares' },
    { slug: 'safeguardindustrial', companyName: 'SafeGuard Industrial Supplies', city: 'Ahmedabad', category: 'Safety & PPE' },
    { slug: 'nationalppe', companyName: 'National PPE & Safety Co.', city: 'Surat', category: 'Safety & PPE' },
    { slug: 'trustwear', companyName: 'TrustWear Protective Gear', city: 'Vadodara', category: 'Safety & PPE' },
    { slug: 'westernabrasives', companyName: 'Western Abrasives Ltd', city: 'Rajkot', category: 'Abrasives & Cutting Tools' },
    { slug: 'deccancutting', companyName: 'Deccan Cutting Tools Co.', city: 'Nashik', category: 'Abrasives & Cutting Tools' },
    { slug: 'coastalfastener', companyName: 'Coastal Fastener Traders', city: 'Kochi', category: 'Mechanical Spares' },
  ];

  const credentials: { companyName: string; email: string; password: string }[] = [];
  const vendors = [];

  for (let i = 0; i < vendorSeed.length; i++) {
    const v = vendorSeed[i];
    const n = i + 1;
    const email = `vendor${n}@${v.slug}.example`;
    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    // update (not `{}`) on conflict — re-running the seed always resets the
    // password to the freshly generated one, so the credentials printed
    // below are always truthful about what's actually in the database.
    const fields = {
      companyName: v.companyName,
      city: v.city,
      phone: `+9198000000${String(n).padStart(2, '0')}`,
      registeredCategories: [v.category],
      passwordHash,
    };
    const vendor = await prisma.vendor.upsert({
      where: { email },
      update: fields,
      create: {
        ...fields,
        email,
        // NDA pre-accepted for every seeded vendor except the 3rd, which is
        // deliberately left unaccepted to exercise the acceptance gate.
        // Only set on create — re-seeding shouldn't silently re-lock a
        // vendor who accepted it for real during a demo session.
        ndaAcceptedAt: n === 3 ? null : new Date(),
      },
    });
    vendors.push(vendor);
    credentials.push({ companyName: v.companyName, email, password });
  }

  const thread1 = await prisma.prThread.upsert({
    where: { threadCode: 'THR-2031' },
    update: {},
    create: {
      threadCode: 'THR-2031',
      title: 'Taper Roller Bearings & Coupling Assemblies',
      category: 'Mechanical Spares',
      purchaseCode: 'PC-MECH-01',
      department: 'Mechanical',
      costCentre: 'CC-001',
      tcBuyerName: 'Yash Patel',
      qtyDescription: '240 sets',
      referralNote:
        'RFQ spread was wide (₹16.2L–₹21.4L) across responsive vendors — recommend a live auction to compress before award.',
      resultsNeededBy: new Date(Date.now() + 2 * 86400000),
      status: 'referred',
      createdById: team.id,
    },
  });

  const thread2 = await prisma.prThread.upsert({
    where: { threadCode: 'THR-2044' },
    update: {},
    create: {
      threadCode: 'THR-2044',
      title: 'Industrial Safety Gloves & PPE Kit',
      category: 'Safety & PPE',
      purchaseCode: 'PC-SAFETY-01',
      department: 'Safety',
      costCentre: 'CC-005',
      tcBuyerName: 'Neha Kulkarni',
      qtyDescription: '5,000 kits',
      referralNote:
        'Four VRQ-approved vendors responded within 8% of each other on the RFQ — auction likely to yield meaningful compression.',
      resultsNeededBy: new Date(Date.now() + 3 * 86400000),
      status: 'referred',
      createdById: team.id,
    },
  });

  console.log('\n=== ProcEaze Auction — seeded credentials ===\n');
  console.log('Auction Team login:');
  console.log(`  ${team.email} / password123\n`);
  console.log('Vendor logins (10):');
  for (const c of credentials) {
    console.log(`  ${c.companyName.padEnd(32)} ${c.email.padEnd(38)} / ${c.password}`);
  }
  console.log(`\nThreads referred: ${thread1.threadCode}, ${thread2.threadCode}`);
  console.log('\n(Anand Engineering Works has NOT accepted the NDA yet — use it to test the acceptance gate.)\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
