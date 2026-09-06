/**
 * Run this against production without ever handing the DB credentials to anyone else:
 *
 *   DATABASE_URL="<production connection string from Render>" node scripts/audit-whatsapp-templates.js
 *   DATABASE_URL="<production connection string from Render>" node scripts/audit-whatsapp-templates.js --apply
 *
 * Without --apply it only reports: which templates look like Meta's own test/sample templates
 * (e.g. "hello_world") but are marked APPROVED, and which campaigns point at them.
 *
 * With --apply it flips those templates to DISABLED so the app's send-time guard
 * (assertTemplateApproved in campaigns.service.ts) will refuse to use them again. It never
 * touches campaigns or picks a replacement template for you — repoint each listed campaign to
 * a real Meta-approved template yourself, then resend.
 *
 * Does not read this project's .env — DATABASE_URL must be passed explicitly on the command
 * line, so pointing this at production never risks writing prod creds into a local file.
 */
const { PrismaClient } = require("@prisma/client");

const KNOWN_TEST_TEMPLATE_NAMES = ["hello_world"];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL to the target database's connection string before running this.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();

  try {
    const suspects = await prisma.whatsAppTemplate.findMany({
      where: { name: { in: KNOWN_TEST_TEMPLATE_NAMES }, status: "APPROVED" },
      include: { campaigns: { select: { id: true, name: true, status: true, organizationId: true } } },
    });

    if (!suspects.length) {
      console.log("No test/sample templates found marked APPROVED. Nothing to do.");
      return;
    }

    for (const template of suspects) {
      console.log(`\nTemplate "${template.name}" (${template.id}) — org ${template.organizationId} — status ${template.status}`);
      if (!template.campaigns.length) {
        console.log("  Not attached to any campaign.");
      } else {
        for (const c of template.campaigns) {
          console.log(`  Campaign "${c.name}" (${c.id}) — status ${c.status} — needs a real approved template before it can send again.`);
        }
      }
    }

    if (!apply) {
      console.log("\nDry run only — rerun with --apply to set these templates to DISABLED.");
      return;
    }

    const result = await prisma.whatsAppTemplate.updateMany({
      where: { id: { in: suspects.map((t) => t.id) } },
      data: { status: "DISABLED" },
    });
    console.log(`\nDisabled ${result.count} template(s). Repoint the campaigns listed above to an approved template.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
