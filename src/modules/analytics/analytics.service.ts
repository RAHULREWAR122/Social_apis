import { prisma } from "../../lib/prisma";

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sumStatuses(rows: { status: string; _count: number }[], statuses: string[]) {
  return rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count, 0);
}

const SOCIAL_PLATFORMS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN_PERSONAL", "LINKEDIN_ORGANIZATION"] as const;

async function getSocialAnalytics(organizationId: string, since: Date) {
  const [postsThisMonth, targets, recentPosts] = await Promise.all([
    prisma.socialPost.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.socialPostTarget.findMany({
      where: { socialPost: { organizationId, createdAt: { gte: since } } },
      select: { status: true, socialAccount: { select: { platform: true } } },
    }),
    prisma.socialPost.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { targets: { include: { socialAccount: { select: { platform: true } } } } },
    }),
  ]);

  const byPlatform = SOCIAL_PLATFORMS.map((platform) => {
    const rows = targets.filter((t) => t.socialAccount.platform === platform);
    return {
      platform,
      published: rows.filter((t) => t.status === "PUBLISHED").length,
      failed: rows.filter((t) => t.status === "FAILED").length,
      pending: rows.filter((t) => t.status === "PENDING" || t.status === "PROCESSING").length,
    };
  }).filter((row) => row.published + row.failed + row.pending > 0);

  return {
    postsThisMonth,
    byPlatform,
    recentPosts: recentPosts.map((post) => ({
      id: post.id,
      caption: post.caption,
      status: post.status,
      createdAt: post.createdAt,
      targets: post.targets.map((t) => ({ platform: t.socialAccount.platform, status: t.status })),
    })),
  };
}

export async function getDashboardAnalytics(organizationId: string) {
  const since = startOfMonth();

  const [contactsCount, campaignsThisMonth, emailStats, whatsappStats, recentCampaigns, social] = await Promise.all([
    prisma.contact.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.campaign.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      where: { campaign: { organizationId, channel: "EMAIL" }, sentAt: { gte: since } },
      _count: true,
    }),
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      where: { campaign: { organizationId, channel: "WHATSAPP" }, sentAt: { gte: since } },
      _count: true,
    }),
    prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { recipients: true } } },
    }),
    getSocialAnalytics(organizationId, since),
  ]);

  const emailAttempted = sumStatuses(emailStats, ["SENT", "DELIVERED", "FAILED", "BOUNCED"]);
  const emailDelivered = sumStatuses(emailStats, ["SENT", "DELIVERED"]);
  const whatsappAttempted = sumStatuses(whatsappStats, ["SENT", "DELIVERED", "FAILED"]);
  const whatsappDelivered = sumStatuses(whatsappStats, ["SENT", "DELIVERED"]);

  return {
    contactsCount,
    campaignsThisMonth,
    emailSentThisMonth: emailAttempted,
    whatsappSentThisMonth: whatsappAttempted,
    emailDeliveryRate: emailAttempted ? Math.round((emailDelivered / emailAttempted) * 100) : null,
    whatsappDeliveryRate: whatsappAttempted ? Math.round((whatsappDelivered / whatsappAttempted) * 100) : null,
    recentCampaigns: recentCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      recipientCount: campaign._count.recipients,
    })),
    social,
  };
}
