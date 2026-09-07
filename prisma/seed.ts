import { PrismaClient, PaymentCycle } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting client-ready database seeding...");

  // ==========================================
  // 1. ADMIN USER & BUSINESS PROFILE
  // ==========================================
  // Note: Advise the client to change this default password immediately after handoff.
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD not set");

  await prisma.user.upsert({
    where: { email: process.env.SEED_ADMIN_EMAIL },
    update: { role: "ADMIN" }, // never touch password on update
    create: {
      email: "email",
      password: await bcrypt.hash(password, 10),
      role: "ADMIN",
    },
  });

  await prisma.businessProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      companyName: "Veneer and Keying",
      tagline: "Construction and Interior Design",
      address: "5B, Pey Gopuram 3rd St, Tiruvannamalai, TN",
      phone: "000000000",
      email: "email",
      gstNumber: "",
      defaultTerms: "1. Payment due within 15 days of invoice generation.",
    },
  });

  // Initialize voucher sequences starting at 1000
  const sequences = [
    "VENDOR_PUR",
    "VENDOR_PAY",
    "CLIENT_PAY",
    "INV_TXN",
    "EXPENSE",
    "EXTRA_WORK",
    "LABOUR_PAY",
    "DL_ENTRY",
  ];
  for (const seq of sequences) {
    await prisma.voucherSequence.upsert({
      where: { id: seq },
      update: {},
      create: { id: seq, nextVal: 1000 },
    });
  }

  // ==========================================
  // 2. SYSTEM MASTER DATA (Groups & Worker Types)
  // ==========================================
  const groups = {
    civil: await prisma.bOQGroup.upsert({
      where: { name: "Civil Works" },
      update: {},
      create: { name: "Civil Works", sortOrder: 1 },
    }),
    electrical: await prisma.bOQGroup.upsert({
      where: { name: "Electrical Works" },
      update: {},
      create: { name: "Electrical Works", sortOrder: 2 },
    }),
    plumbing: await prisma.bOQGroup.upsert({
      where: { name: "Plumbing Works" },
      update: {},
      create: { name: "Plumbing Works", sortOrder: 3 },
    }),
    finishing: await prisma.bOQGroup.upsert({
      where: { name: "Interior Works" },
      update: {},
      create: { name: "Interior Works", sortOrder: 4 },
    }),
  };

  const workerTypes = [
    { name: "Mason", rate: 1100, cycle: PaymentCycle.WEEKLY },
    { name: "Carpenter", rate: 1200, cycle: PaymentCycle.WEEKLY },
    { name: "Cupboard Carpenter", rate: 1300, cycle: PaymentCycle.WEEKLY },
    { name: "Painter", rate: 1000, cycle: PaymentCycle.WEEKLY },
    { name: "Electrician", rate: 1300, cycle: PaymentCycle.DAILY },
    { name: "Tiles Mason", rate: 1200, cycle: PaymentCycle.WEEKLY },
    {
      name: "Bar Bender / Steel Fixer",
      rate: 1100,
      cycle: PaymentCycle.WEEKLY,
    },
    {
      name: "Centering / Shuttering Workers",
      rate: 1100,
      cycle: PaymentCycle.WEEKLY,
    },
    { name: "Glass Worker", rate: 1200, cycle: PaymentCycle.WEEKLY },
    { name: "SS Worker", rate: 1200, cycle: PaymentCycle.WEEKLY },
    { name: "Chipping Worker", rate: 900, cycle: PaymentCycle.WEEKLY },
    { name: "Plumber", rate: 1200, cycle: PaymentCycle.DAILY },
    { name: "Welder", rate: 1200, cycle: PaymentCycle.WEEKLY },
    {
      name: "Aluminium / UPVC Door & Window Installer",
      rate: 1200,
      cycle: PaymentCycle.WEEKLY,
    },
    {
      name: "CNC / ACP Cladding Worker",
      rate: 1300,
      cycle: PaymentCycle.WEEKLY,
    },
    {
      name: "POP / Gypsum Ceiling Worker",
      rate: 1200,
      cycle: PaymentCycle.WEEKLY,
    },
    { name: "Granite / Marble Worker", rate: 1300, cycle: PaymentCycle.WEEKLY },
    { name: "Excavation Workers", rate: 900, cycle: PaymentCycle.DAILY },
    { name: "Helpers", rate: 800, cycle: PaymentCycle.WEEKLY },
    { name: "Scaffolding Workers", rate: 1000, cycle: PaymentCycle.WEEKLY },
    { name: "Roofing Workers", rate: 1100, cycle: PaymentCycle.WEEKLY },
    { name: "Paver Block Workers", rate: 1000, cycle: PaymentCycle.WEEKLY },
    {
      name: "Hydraulic / Earthmoving Machine Operators",
      rate: 1500,
      cycle: PaymentCycle.DAILY,
    },
    { name: "Housekeeping Staff", rate: 700, cycle: PaymentCycle.WEEKLY },
  ];

  for (const wt of workerTypes) {
    await prisma.workerType.upsert({
      where: { name: wt.name },
      update: {},
      create: { name: wt.name, defaultRate: wt.rate, paymentCycle: wt.cycle },
    });
  }

  // ==========================================
  // 3. MASTER BOQ TEMPLATES
  // ==========================================
  // Construction Template
  const template = await prisma.bOQTemplate.create({
    data: { name: "Construction Template", category: "Residential" },
  });

  // Part A - Construction Quote
  const civilTemplateSec = await prisma.bOQTemplateSection.create({
    data: {
      templateId: template.id,
      name: "Part A - Construction Quote",
      groupId: groups.civil.id,
      sortOrder: 1,
    },
  });
  await prisma.bOQTemplateLineItem.createMany({
    data: [
      {
        sectionId: civilTemplateSec.id,
        title: "Stilt Parking Area",
        sortOrder: 1,
      },
      { sectionId: civilTemplateSec.id, title: "Buildup Area", sortOrder: 2 },
      {
        sectionId: civilTemplateSec.id,
        title: "Borewell - 100 Feet Depth",
        sortOrder: 3,
      },
      {
        sectionId: civilTemplateSec.id,
        title: "Sump - 8,000 Litres Capacity",
        sortOrder: 4,
      },
      {
        sectionId: civilTemplateSec.id,
        title: "Civil Overhead Water Tank - 3,000 Litres",
        sortOrder: 5,
      },
      {
        sectionId: civilTemplateSec.id,
        title: "Front Elevation Work (Texture Painting)",
        sortOrder: 6,
      },
      {
        sectionId: civilTemplateSec.id,
        title: "Weathering Course",
        sortOrder: 7,
      },
      { sectionId: civilTemplateSec.id, title: "Pressure Pump", sortOrder: 8 },
      {
        sectionId: civilTemplateSec.id,
        title: "Motorised Grill Gate",
        sortOrder: 9,
      },
      { sectionId: civilTemplateSec.id, title: "Soil Test", sortOrder: 10 },
    ],
  });

  // Part B - Interior Works
  const interiorTemplateSec = await prisma.bOQTemplateSection.create({
    data: {
      templateId: template.id,
      name: "Part B - Interior Works",
      groupId: groups.finishing.id,
      sortOrder: 2,
    },
  });
  await prisma.bOQTemplateLineItem.createMany({
    data: [
      {
        sectionId: interiorTemplateSec.id,
        title: "Plain Gypsum False Ceiling",
        sortOrder: 1,
      },
      {
        sectionId: interiorTemplateSec.id,
        title: "Modular Kitchen Bottom Unit",
        sortOrder: 2,
      },
      {
        sectionId: interiorTemplateSec.id,
        title: "Modular Kitchen Wall Unit",
        sortOrder: 3,
      },
      { sectionId: interiorTemplateSec.id, title: "Loft", sortOrder: 4 },
      {
        sectionId: interiorTemplateSec.id,
        title: "Master Bedroom Wardrobe",
        sortOrder: 5,
      },
      {
        sectionId: interiorTemplateSec.id,
        title: "Master Bedroom TV Unit",
        sortOrder: 6,
      },
      { sectionId: interiorTemplateSec.id, title: "Pooja Unit", sortOrder: 7 },
    ],
  });

  console.log(
    "✅ SEEDING COMPLETE! The system is configured and ready for the client to add their first project.",
  );
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
