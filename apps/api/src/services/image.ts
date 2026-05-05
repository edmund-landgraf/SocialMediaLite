import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 500 * 1024;

export type ProcessedImage = {
  buffer: Buffer;
  contentType: "image/webp";
};

/**
 * Ensures image is at most MAX_UPLOAD_BYTES by resizing and WebP compression.
 * Throws if still too large after attempts.
 */
/** Fixed OG-style thumbnail for link preview cards (~1.92:1, heavily compressed WebP). */
export async function resizeLinkPreviewHero(input: Buffer): Promise<ProcessedImage> {
  const width = 476;
  const height = 248;
  let quality = 78;
  let buffer = await sharp(input)
    .rotate()
    .resize({ width, height, fit: "cover", position: "entropy" })
    .webp({ quality })
    .toBuffer();

  for (let i = 0; i < 7 && buffer.length > 140_000; i++) {
    quality = Math.max(48, quality - 8);
    buffer = await sharp(input)
      .rotate()
      .resize({ width, height, fit: "cover", position: "entropy" })
      .webp({ quality })
      .toBuffer();
  }

  return { buffer, contentType: "image/webp" };
}

export async function processImageToMaxSize(
  input: Buffer,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<ProcessedImage> {
  let width = 2048;
  let quality = 82;
  let buffer = await sharp(input).rotate().webp({ quality }).toBuffer();

  for (let i = 0; i < 8 && buffer.length > maxBytes; i++) {
    width = Math.max(480, Math.floor(width * 0.75));
    quality = Math.max(50, quality - 8);
    buffer = await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  }

  if (buffer.length > maxBytes) {
    throw new Error(
      "Image is still larger than 500KB after compression. Use a smaller photo or paste an image link instead.",
    );
  }

  return { buffer, contentType: "image/webp" };
}
