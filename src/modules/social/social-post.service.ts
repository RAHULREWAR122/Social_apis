import type { MediaType, SocialPlatform } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { socialPublishQueue } from "../../lib/queue";
import { assertSocialFeatureAvailable } from "../billing/usage.service";

const CAROUSEL_MAX_ITEMS = 10;

type CreatePostInput = {
  caption: string;
  mediaIds: string[];
  socialAccountIds: string[];
  scheduledAt?: string;
};

function validateMediaForPlatform(platform: SocialPlatform, media: { mediaType: MediaType }[]) {
  const videoCount = media.filter((item) => item.mediaType === "VIDEO").length;

  if (platform === "FACEBOOK" && videoCount > 0 && media.length > 1) {
    throw new HttpError(400, "Facebook does not support posts mixing video with multiple items");
  }
  if ((platform === "LINKEDIN_PERSONAL" || platform === "LINKEDIN_ORGANIZATION") && videoCount > 0 && media.length > 1) {
    throw new HttpError(400, "LinkedIn does not support posts mixing video with multiple items");
  }
}

export async function createPost(organizationId: string, userId: string, input: CreatePostInput) {
  await assertSocialFeatureAvailable(organizationId);

  if (input.mediaIds.length > CAROUSEL_MAX_ITEMS) {
    throw new HttpError(400, `At most ${CAROUSEL_MAX_ITEMS} media items are allowed per post`);
  }

  const media = await prisma.media.findMany({ where: { id: { in: input.mediaIds }, organizationId } });
  if (media.length !== input.mediaIds.length) {
    throw new HttpError(400, "One or more media items were not found");
  }
  // Preserve the order the caller specified (findMany doesn't guarantee `in`-clause order).
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const orderedMedia = input.mediaIds.map((id) => mediaById.get(id)!);

  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: input.socialAccountIds }, organizationId },
  });
  if (accounts.length !== input.socialAccountIds.length) {
    throw new HttpError(400, "One or more connected accounts were not found");
  }
  const disconnected = accounts.find((a) => a.status !== "CONNECTED");
  if (disconnected) {
    throw new HttpError(400, `${disconnected.platform} account is not connected — reconnect it before posting`);
  }

  for (const account of accounts) {
    validateMediaForPlatform(account.platform, orderedMedia);
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new HttpError(400, "scheduledAt must be in the future");
  }

  const post = await prisma.socialPost.create({
    data: {
      organizationId,
      caption: input.caption,
      createdByUserId: userId,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledAt,
      media: {
        create: orderedMedia.map((m, position) => ({ mediaId: m.id, position })),
      },
      targets: {
        create: accounts.map((account) => ({ socialAccountId: account.id })),
      },
    },
    include: { media: { include: { media: true } }, targets: { include: { socialAccount: true } } },
  });

  if (scheduledAt) {
    await enqueueTargets(post.id, post.targets.map((t) => t.id), scheduledAt.getTime() - Date.now());
  } else {
    await publishNow(post.id);
  }

  return getPost(organizationId, post.id);
}

async function enqueueTargets(postId: string, targetIds: string[], delay?: number) {
  await socialPublishQueue.addBulk(
    targetIds.map((socialPostTargetId) => ({
      name: "publish",
      data: { socialPostTargetId },
      opts: delay ? { delay, jobId: `social-publish-${socialPostTargetId}` } : { jobId: `social-publish-${socialPostTargetId}` },
    })),
  );
}

export async function publishNow(postId: string) {
  const post = await prisma.socialPost.update({
    where: { id: postId },
    data: { status: "QUEUED" },
    include: { targets: true },
  });
  await enqueueTargets(postId, post.targets.map((t) => t.id));
  return post;
}

export async function listPosts(organizationId: string) {
  return prisma.socialPost.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      media: { orderBy: { position: "asc" }, include: { media: true } },
      targets: { include: { socialAccount: true } },
    },
  });
}

export async function getPost(organizationId: string, postId: string) {
  const post = await prisma.socialPost.findFirst({
    where: { id: postId, organizationId },
    include: {
      media: { orderBy: { position: "asc" }, include: { media: true } },
      targets: { include: { socialAccount: true } },
    },
  });
  if (!post) throw new HttpError(404, "Post not found");
  return post;
}

export async function cancelPost(organizationId: string, postId: string) {
  const post = await getPost(organizationId, postId);
  if (post.status !== "SCHEDULED" && post.status !== "QUEUED") {
    throw new HttpError(409, `Cannot cancel a post that is ${post.status.toLowerCase()}`);
  }
  return prisma.socialPost.update({ where: { id: postId }, data: { status: "CANCELLED" } });
}

export async function deletePost(organizationId: string, postId: string) {
  const post = await getPost(organizationId, postId);
  if (post.status !== "DRAFT") {
    throw new HttpError(409, "Only draft posts can be deleted");
  }
  await prisma.socialPost.delete({ where: { id: postId } });
}

/** Rolls per-target statuses up into the post's overall status once every target is terminal. */
export async function maybeCompletePost(postId: string) {
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, include: { targets: true } });
  if (!post || post.status === "CANCELLED") return;

  const pending = post.targets.filter((t) => t.status === "PENDING" || t.status === "PROCESSING");
  if (pending.length > 0) return;

  const published = post.targets.filter((t) => t.status === "PUBLISHED").length;
  const status = published === 0 ? "FAILED" : published === post.targets.length ? "PUBLISHED" : "PARTIALLY_PUBLISHED";

  await prisma.socialPost.update({
    where: { id: postId },
    data: { status, publishedAt: published > 0 ? new Date() : undefined },
  });
}
