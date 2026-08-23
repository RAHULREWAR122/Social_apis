import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env";

export interface StorageAdapter {
  saveFile(organizationId: string, filename: string, buffer: Buffer): Promise<{ storagePath: string }>;
  getPublicUrl(storagePath: string): string;
  deleteFile(storagePath: string): Promise<void>;
}

const UPLOADS_ROOT = path.resolve(process.cwd(), env.UPLOADS_DIR);

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Local disk storage — swap this implementation for an S3-compatible one later; callers only
// ever import the `storage` singleton below, never this class directly.
class LocalDiskStorage implements StorageAdapter {
  async saveFile(organizationId: string, filename: string, buffer: Buffer) {
    const orgDir = path.join(UPLOADS_ROOT, organizationId);
    await fs.mkdir(orgDir, { recursive: true });

    const uniqueName = `${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
    const storagePath = path.join(organizationId, uniqueName).split(path.sep).join("/");
    await fs.writeFile(path.join(UPLOADS_ROOT, storagePath), buffer);

    return { storagePath };
  }

  getPublicUrl(storagePath: string) {
    return `${env.API_ORIGIN}/uploads/${storagePath}`;
  }

  async deleteFile(storagePath: string) {
    await fs.rm(path.join(UPLOADS_ROOT, storagePath), { force: true });
  }
}

export const storage: StorageAdapter = new LocalDiskStorage();
