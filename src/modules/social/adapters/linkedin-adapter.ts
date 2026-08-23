import axios from "axios";
import { env } from "../../../config/env";
import { HttpError } from "../../../utils/http-error";
import { getAccessTokenForAccount } from "../../integrations/linkedin.service";
import type { SocialMediaItem } from "./facebook-adapter";

const API_BASE = "https://api.linkedin.com/rest";

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": env.LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function authorUrn(account: { platform: string; externalAccountId: string; metadata: unknown }) {
  if (account.platform === "LINKEDIN_ORGANIZATION") {
    const metadata = account.metadata as { organizationUrn?: string } | null;
    return metadata?.organizationUrn ?? `urn:li:organization:${account.externalAccountId}`;
  }
  return `urn:li:person:${account.externalAccountId}`;
}

// LinkedIn's Posts API can't just be handed a public URL — the asset must first be registered,
// then the raw bytes PUT to the upload URL it returns. Local storage means we have to fetch our
// own publicUrl to get those bytes.
async function uploadAsset(item: SocialMediaItem, owner: string, accessToken: string) {
  const kind = item.mediaType === "VIDEO" ? "videos" : "images";
  const { data: init } = await axios.post(
    `${API_BASE}/${kind}?action=initializeUpload`,
    { initializeUploadRequest: { owner } },
    { headers: headers(accessToken) },
  );

  const uploadUrl: string = init.value.uploadUrl;
  const assetUrn: string = init.value[kind === "videos" ? "video" : "image"];

  const { data: bytes } = await axios.get(item.publicUrl, { responseType: "arraybuffer" });
  await axios.put(uploadUrl, bytes, { headers: { Authorization: `Bearer ${accessToken}` } });

  return assetUrn;
}

export async function publishToLinkedIn(input: {
  socialAccountId: string;
  caption: string;
  media: SocialMediaItem[];
}) {
  const { account, accessToken } = await getAccessTokenForAccount(input.socialAccountId);
  const owner = authorUrn(account);

  if (input.media.length === 0) {
    throw new HttpError(400, "At least one image or video is required for a LinkedIn post");
  }

  const videoCount = input.media.filter((item) => item.mediaType === "VIDEO").length;
  if (videoCount > 0 && input.media.length > 1) {
    throw new HttpError(400, "LinkedIn does not support mixing video with multiple items in one post");
  }

  let content: Record<string, unknown> | undefined;
  if (input.media.length === 1 && input.media[0].mediaType === "VIDEO") {
    const videoUrn = await uploadAsset(input.media[0], owner, accessToken);
    content = { media: { id: videoUrn } };
  } else if (input.media.length === 1) {
    const imageUrn = await uploadAsset(input.media[0], owner, accessToken);
    content = { media: { id: imageUrn } };
  } else {
    const images = [];
    for (const item of input.media) {
      const imageUrn = await uploadAsset(item, owner, accessToken);
      images.push({ id: imageUrn, altText: "" });
    }
    content = { multiImage: { images } };
  }

  const { data, headers: responseHeaders } = await axios.post(
    `${API_BASE}/posts`,
    {
      author: owner,
      commentary: input.caption,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content,
      lifecycleState: "PUBLISHED",
    },
    { headers: headers(accessToken) },
  );

  // LinkedIn's Posts API returns the created post's URN in the `x-restli-id` response header,
  // not in the JSON body.
  const providerPostId: string = responseHeaders["x-restli-id"] ?? data?.id ?? "unknown";
  return { providerPostId };
}
