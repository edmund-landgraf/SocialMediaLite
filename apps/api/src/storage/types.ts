export type PutObjectInput = {
  key: string;
  contentType: string;
  buffer: Buffer;
};

export interface StorageProvider {
  putObject(input: PutObjectInput): Promise<void>;
  /** Public URL path served by the API (e.g. `/assets/users/.../file.webp`) */
  getPublicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
}
