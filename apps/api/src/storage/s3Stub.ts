import type { PutObjectInput, StorageProvider } from "./types.js";

/**
 * Placeholder for a future S3-compatible implementation.
 * `STORAGE_PROVIDER=s3` selects this class; all methods throw until implemented.
 */
export class S3StorageProviderStub implements StorageProvider {
  async putObject(_input: PutObjectInput): Promise<void> {
    throw new Error("S3 storage is not implemented yet (Phase 1 stub).");
  }

  getPublicUrl(_key: string): string {
    throw new Error("S3 storage is not implemented yet (Phase 1 stub).");
  }

  async deleteObject(_key: string): Promise<void> {
    throw new Error("S3 storage is not implemented yet (Phase 1 stub).");
  }
}
