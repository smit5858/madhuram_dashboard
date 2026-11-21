import { useQueries, useQuery } from "@tanstack/react-query";
import productService, { type ProductImageRef } from "@/services/product.service";

/** Photos are immutable server-side (replacing one creates a new id), so a photo id is a stable cache key. */
export const productImageQueryKey = (imageId: number) => ["product-image", imageId] as const;

type LoadedImage = { blob: Blob; url: string };

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const imageQuery = (productId: number, imageId: number) => ({
  queryKey: productImageQueryKey(imageId),
  queryFn: async (): Promise<LoadedImage> => {
    const blob = (await productService.getProductImage(productId, imageId)).data;
    return { blob, url: await blobToDataUrl(blob) };
  },
  retry: false,
  staleTime: Infinity,
  gcTime: 30 * 60_000,
});

/**
 * Loads one product photo through the authenticated API (it can't be a plain <img src> URL). Returned
 * as a data URL — photos are resized on upload, so it stays small and needs no object-URL cleanup.
 * `url`/`blob` are null when `imageId` is null or the photo failed to load — callers show a placeholder.
 */
export const useProductImage = (productId: number, imageId: number | null | undefined) => {
  const { data, isLoading } = useQuery({
    ...imageQuery(productId, imageId ?? 0),
    enabled: !!imageId,
  });
  const active = !!imageId && !!data;
  return { url: active ? data.url : null, blob: active ? data.blob : null, isLoading: !!imageId && isLoading };
};

/** All of a product's photos (cover first), sharing the same per-photo cache as useProductImage. */
export const useProductImages = (productId: number, images: ProductImageRef[] | undefined) => {
  const results = useQueries({ queries: (images ?? []).map((img) => imageQuery(productId, img.id)) });
  return {
    blobs: results.map((r) => r.data?.blob).filter((b): b is Blob => !!b),
    isLoading: results.some((r) => r.isLoading),
  };
};
