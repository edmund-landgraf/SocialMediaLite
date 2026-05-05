import fs from "node:fs/promises";
import path from "node:path";
import type { PutObjectInput, StorageProvider } from "./types.js";

function resolveRoot(root: string): string {
  return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

export function getResolvedLocalStorageRoot(): string {
  const raw = process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), "storage");
  return resolveRoot(raw);
}

export class LocalDiskStorageProvider implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  static fromEnv(): LocalDiskStorageProvider {
    return new LocalDiskStorageProvider(getResolvedLocalStorageRoot());
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const full = path.join(this.rootDir, input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.buffer);
  }

  getPublicUrl(key: string): string {
    return `/assets/${key.split(path.sep).join("/")}`;
  }

  async deleteObject(key: string): Promise<void> {
    const full = path.join(this.rootDir, key);
    await fs.unlink(full).catch(() => undefined);
  }
}
