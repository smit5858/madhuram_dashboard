/** Longest side of an uploaded product photo — plenty for a phone-sized catalogue card / PDF. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
/** Raw file size accepted before resizing (phone camera photos are often 5–12 MB). */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as an image"));
    };
    img.src = url;
  });

/**
 * Resizes (keeping the original aspect ratio) and re-encodes a picked photo as JPEG before upload,
 * so uploads stay small and the backend PDF generator (JPEG/PNG only) can always embed it — WEBP/HEIC
 * sources the browser can decode become JPEG too. Transparent areas are filled white.
 */
export const prepareProductImage = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Image is too large (max 20 MB)");

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Could not process this image");
  return blob;
};
