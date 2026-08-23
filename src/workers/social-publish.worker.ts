import { Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { queueConnection, type SocialPublishJob } from "../lib/queue";
import { maybeCompletePost } from "../modules/social/social-post.service";
import { publishToFacebook } from "../modules/social/adapters/facebook-adapter";
import { publishToInstagram } from "../modules/social/adapters/instagram-adapter";
import { publishToLinkedIn } from "../modules/social/adapters/linkedin-adapter";

// Meta OAuthException code for an expired/invalid token — surfaced so the UI can prompt reconnect.
function isAuthError(err: unknown) {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const metaCode = (err as { response?: { data?: { error?: { code?: number } } } })?.response?.data?.error?.code;
  return status === 401 || metaCode === 190;
}

export function startSocialPublishWorker() {
  const worker = new Worker<SocialPublishJob>(
    "social-publish",
    async (job) => {
      const { socialPostTargetId } = job.data;

      const target = await prisma.socialPostTarget.findUnique({
        where: { id: socialPostTargetId },
        include: {
          socialAccount: true,
          socialPost: { include: { media: { orderBy: { position: "asc" }, include: { media: true } } } },
        },
      });
      if (!target) return;
      if (target.socialPost.status === "CANCELLED" || target.status !== "PENDING") return;

      await prisma.socialPostTarget.update({ where: { id: target.id }, data: { status: "PROCESSING" } });

      const media = target.socialPost.media.map((m) => ({
        id: m.media.id,
        publicUrl: m.media.publicUrl,
        mediaType: m.media.mediaType,
      }));
      const publishInput = { socialAccountId: target.socialAccountId, caption: target.socialPost.caption, media };

      try {
        const { providerPostId } =
          target.socialAccount.platform === "FACEBOOK"
            ? await publishToFacebook(publishInput)
            : target.socialAccount.platform === "INSTAGRAM"
              ? await publishToInstagram(publishInput)
              : await publishToLinkedIn(publishInput);

        await prisma.socialPostTarget.update({
          where: { id: target.id },
          data: { status: "PUBLISHED", providerPostId, publishedAt: new Date() },
        });
      } catch (err) {
        await prisma.socialPostTarget.update({
          where: { id: target.id },
          data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Publish failed" },
        });
        if (isAuthError(err)) {
          await prisma.socialAccount.update({ where: { id: target.socialAccountId }, data: { status: "ERROR" } });
        }
      }

      await maybeCompletePost(target.socialPostId);
    },
    { connection: queueConnection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`social-publish job ${job?.id} failed:`, err.message);
  });

  return worker;
}
