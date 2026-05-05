import type { StorageProvider } from "./types.js";
import { LocalDiskStorageProvider } from "./localDisk.js";
import { S3StorageProviderStub } from "./s3Stub.js";

export type { StorageProvider } from "./types.js";
export { getResolvedLocalStorageRoot } from "./localDisk.js";

export function createStorageProviderFromEnv(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  if (provider === "local") return LocalDiskStorageProvider.fromEnv();
  if (provider === "s3") return new S3StorageProviderStub();
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider} (expected local|s3)`);
}
