import { Request, Response } from "express";
import * as socialPostService from "./social-post.service";
import { createSocialPostSchema } from "./social-post.validation";

export async function listPosts(req: Request, res: Response) {
  const posts = await socialPostService.listPosts(req.auth!.organizationId);
  res.json({ posts });
}

export async function getPost(req: Request, res: Response) {
  const post = await socialPostService.getPost(req.auth!.organizationId, req.params.id);
  res.json({ post });
}

export async function createPost(req: Request, res: Response) {
  const input = createSocialPostSchema.parse(req.body);
  const post = await socialPostService.createPost(req.auth!.organizationId, req.auth!.userId, input);
  res.status(201).json({ post });
}

export async function cancelPost(req: Request, res: Response) {
  const post = await socialPostService.cancelPost(req.auth!.organizationId, req.params.id);
  res.json({ post });
}

export async function deletePost(req: Request, res: Response) {
  await socialPostService.deletePost(req.auth!.organizationId, req.params.id);
  res.status(204).send();
}
