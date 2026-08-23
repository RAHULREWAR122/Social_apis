import axios from "axios";
import { env } from "../../../config/env";
import { HttpError } from "../../../utils/http-error";
import { getPageAccessToken } from "../../integrations/meta.service";
import type { SocialMediaItem } from "./facebook-adapter";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;
const CAROUSEL_MAX_ITEMS = 10;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // ~2 minutes — video container processing is async on Meta's side

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilFinished(containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const { data } = await axios.get(`${GRAPH_BASE}/${containerId}`, {
      params: { fields: "status_code", access_token: accessToken },
    });

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new HttpError(502, "Instagram failed to process this media");
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new HttpError(504, "Timed out waiting for Instagram to finish processing this media");
}

export async function publishToInstagram(input: {
  socialAccountId: string;
  caption: string;
  media: SocialMediaItem[];
}) {
  const { account, accessToken } = await getPageAccessToken(input.socialAccountId);
  const igUserId = account.externalAccountId;

  if (input.media.length === 0) {
    throw new HttpError(400, "At least one image or video is required for an Instagram post");
  }
  if (input.media.length > CAROUSEL_MAX_ITEMS) {
    throw new HttpError(400, `Instagram carousels support at most ${CAROUSEL_MAX_ITEMS} items`);
  }

  if (input.media.length === 1) {
    const item = input.media[0];
    const { data: container } = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, {
      ...(item.mediaType === "VIDEO"
        ? { video_url: item.publicUrl, media_type: "REELS" }
        : { image_url: item.publicUrl }),
      caption: input.caption,
      access_token: accessToken,
    });

    await waitUntilFinished(container.id, accessToken);

    const { data: published } = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, {
      creation_id: container.id,
      access_token: accessToken,
    });
    return { providerPostId: published.id as string };
  }

  // Carousel: one child container per item, then a parent CAROUSEL container referencing them.
  const childIds: string[] = [];
  for (const item of input.media) {
    const { data: child } = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, {
      ...(item.mediaType === "VIDEO" ? { video_url: item.publicUrl } : { image_url: item.publicUrl }),
      is_carousel_item: true,
      access_token: accessToken,
    });
    await waitUntilFinished(child.id, accessToken);
    childIds.push(child.id);
  }

  const { data: parent } = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, {
    media_type: "CAROUSEL",
    caption: input.caption,
    children: childIds,
    access_token: accessToken,
  });
  await waitUntilFinished(parent.id, accessToken);

  const { data: published } = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    creation_id: parent.id,
    access_token: accessToken,
  });
  return { providerPostId: published.id as string };
}
