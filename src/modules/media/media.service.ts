import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { storage } from "../../lib/storage";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);

export async function createMedia(organizationId: string, file: Express.Multer.File) {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    return saveMedia(organizationId, file, "IMAGE");
  }
  if (VIDEO_MIME_TYPES.has(file.mimetype)) {
    return saveMedia(organizationId, file, "VIDEO");
  }
  throw new HttpError(400, `Unsupported file type: ${file.mimetype}. Use JPEG/PNG/WebP images or MP4/MOV video.`);
}

async function saveMedia(organizationId: string, file: Express.Multer.File, mediaType: "IMAGE" | "VIDEO") {
  const { storagePath } = await storage.saveFile(organizationId, file.originalname, file.buffer);

  return prisma.media.create({
    data: {
      organizationId,
      storagePath,
      publicUrl: storage.getPublicUrl(storagePath),
      mimeType: file.mimetype,
      mediaType,
      fileSizeBytes: file.size,
    },
  });
}

export async function listMedia(organizationId: string) {
  return prisma.media.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteMedia(organizationId: string, mediaId: string) {
  const media = await prisma.media.findFirst({ where: { id: mediaId, organizationId } });
  if (!media) throw new HttpError(404, "Media not found");

  await prisma.media.delete({ where: { id: mediaId } });
  await storage.deleteFile(media.storagePath);
}
