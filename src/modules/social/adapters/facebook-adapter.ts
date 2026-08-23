import axios from "axios";
import { env } from "../../../config/env";
import { HttpError } from "../../../utils/http-error";
import { getPageAccessToken } from "../../integrations/meta.service";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

export type SocialMediaItem = { id: string; publicUrl: string; mediaType: "IMAGE" | "VIDEO" };

export async function publishToFacebook(input: {
  socialAccountId: string;
  caption: string;
  media: SocialMediaItem[];
}) {
  const { account, accessToken } = await getPageAccessToken(input.socialAccountId);
  const pageId = account.externalAccountId;

  if (input.media.length === 0) {
    throw new HttpError(400, "At least one image or video is required for a Facebook post");
  }

  if (input.media.length === 1) {
    const item = input.media[0];
    if (item.mediaType === "VIDEO") {
      const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/videos`, {
        file_url: item.publicUrl,
        description: input.caption,
        access_token: accessToken,
      });
      return { providerPostId: data.id as string };
    }

    const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, {
      url: item.publicUrl,
      caption: input.caption,
      published: true,
      access_token: accessToken,
    });
    return { providerPostId: data.post_id ?? (data.id as string) };
  }

  // Multi-item carousel: Facebook only supports multi-photo posts, not mixed image+video.
  if (input.media.some((item) => item.mediaType === "VIDEO")) {
    throw new HttpError(400, "Facebook does not support posts mixing video with multiple items");
  }

  const attachedMedia = [];
  for (const item of input.media) {
    const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, {
      url: item.publicUrl,
      published: false,
      access_token: accessToken,
    });
    attachedMedia.push({ media_fbid: data.id });
  }

  const { data } = await axios.post(`${GRAPH_BASE}/${pageId}/feed`, {
    message: input.caption,
    attached_media: attachedMedia,
    access_token: accessToken,
  });

  return { providerPostId: data.id as string };
}
