import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Loader2, Plus, Star, Trash2, UploadCloud } from "lucide-react";
import LOGO from "@/assets/logo.png";
import productService, { MAX_PRODUCT_IMAGES, type ProductImageRef } from "@/services/product.service";
import { useProductImage, productImageQueryKey } from "@/hook/useProductImage";
import { prepareProductImage } from "@/pages/products/utils/productImage";

interface ProductImageUploadProps {
  productId: number;
  images: ProductImageRef[] | undefined;
  productName?: string;
  /** Shows add/cover/remove controls — pass the user's Products "update" permission. */
  canEdit: boolean;
  /** Told the new photo list after a successful change, so a parent's snapshot stays fresh. */
  onChange?: (images: ProductImageRef[]) => void;
  /** Tailwind classes for the main photo frame (its aspect ratio). Fixed, so every product looks the same. */
  frameClassName?: string;
}

type ApiError = { response?: { data?: { message?: string } }; message?: string };
const errorMessage = (err: unknown, fallback: string) => (err as ApiError).response?.data?.message || (err as ApiError).message || fallback;

/** Square thumbnail in the strip under the main photo. */
const Thumb = ({ productId, imageId, active, isCover, onClick }: { productId: number; imageId: number; active: boolean; isCover: boolean; onClick: () => void }) => {
  const { url, isLoading } = useProductImage(productId, imageId);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative aspect-square overflow-hidden rounded-lg border bg-white transition ${
        active ? "border-[#1652d9] ring-2 ring-[#1652d9]/30" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain p-0.5" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : null}
        </span>
      )}
      {isCover && (
        <span className="absolute left-0.5 top-0.5 rounded bg-[#1652d9] p-0.5 text-white" title="Cover photo">
          <Star className="h-2.5 w-2.5 fill-current" />
        </span>
      )}
    </button>
  );
};

/**
 * Product photo gallery (up to MAX_PRODUCT_IMAGES, stored in the DB) with inline add / set-cover /
 * remove — used in the Edit Product form, the product detail view and the Share preview. The main
 * frame has a fixed aspect ratio and the photo is fitted inside (never cropped or stretched), so
 * cards look consistent whatever the photo's shape. The first photo is the cover.
 * Render with `key={productId}` so local state resets when the product changes.
 */
const ProductImageUpload = ({ productId, images: imagesProp, productName, canEdit, onChange, frameClassName = "aspect-[4/3]" }: ProductImageUploadProps) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  // Local copy after a change — the parent's product snapshot may be stale (and in the Edit form it
  // must not change, or Formik's enableReinitialize would wipe unsaved edits).
  const [imagesOverride, setImagesOverride] = useState<ProductImageRef[] | null>(null);
  const images = imagesOverride ?? imagesProp ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIndex = Math.max(0, images.findIndex((img) => img.id === selectedId));
  const selected = images[selectedIndex] ?? null;
  const { url, isLoading } = useProductImage(productId, selected?.id);
  const [isUploading, setIsUploading] = useState(false);
  const slotsLeft = MAX_PRODUCT_IMAGES - images.length;

  const applyImages = (next: ProductImageRef[]) => {
    setImagesOverride(next);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    onChange?.(next);
  };

  const coverMutation = useMutation({
    mutationFn: (imageId: number) => productService.setProductCoverImage(productId, imageId),
    onSuccess: (res) => {
      toast.success("Cover photo updated");
      applyImages(res.data.data.images);
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to update cover photo")),
  });

  const removeMutation = useMutation({
    mutationFn: (imageId: number) => productService.deleteProductImage(productId, imageId),
    onSuccess: (res, imageId) => {
      toast.success("Product photo removed");
      queryClient.removeQueries({ queryKey: productImageQueryKey(imageId) });
      setSelectedId(null);
      applyImages(res.data.data.images);
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to remove photo")),
  });

  /** Uploads picked/dropped files one by one (each is resized to JPEG first), up to the free slots. */
  const handleFiles = async (fileList: FileList | null | undefined) => {
    const files = Array.from(fileList ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;
    if (slotsLeft <= 0) {
      toast.error(`A product can have at most ${MAX_PRODUCT_IMAGES} photos — remove one first`);
      return;
    }
    if (files.length > slotsLeft) toast(`Only ${slotsLeft} more photo${slotsLeft === 1 ? "" : "s"} can be added (max ${MAX_PRODUCT_IMAGES})`);

    setIsUploading(true);
    let latest: ProductImageRef[] | null = null;
    let added = 0;
    for (const file of files.slice(0, slotsLeft)) {
      try {
        const res = await productService.uploadProductImage(productId, await prepareProductImage(file));
        latest = res.data.data.images;
        added += 1;
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err, "Failed to upload photo")}`);
      }
    }
    setIsUploading(false);
    if (latest) {
      applyImages(latest);
      setSelectedId(latest[latest.length - 1]?.id ?? null);
      toast.success(added === 1 ? "Product photo added" : `${added} product photos added`);
    }
  };

  const busy = isUploading || coverMutation.isPending || removeMutation.isPending;

  // Drag & drop — the whole gallery is the drop zone (and the empty frame is click-to-upload).
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dropHandlers = canEdit
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          if (!busy) handleFiles(e.dataTransfer.files);
        },
      }
    : {};
  const clickToUpload = canEdit && images.length === 0 && !busy;
  const step = (delta: number) => setSelectedId(images[(selectedIndex + delta + images.length) % images.length].id);

  return (
    <div {...dropHandlers} className="relative">
      <div
        onClick={clickToUpload ? () => inputRef.current?.click() : undefined}
        role={clickToUpload ? "button" : undefined}
        className={`group relative flex items-center justify-center overflow-hidden rounded-xl transition ${
          images.length ? "bg-white border border-slate-200" : canEdit ? "bg-[#eef3ff] border-2 border-dashed border-[#9db6f2]" : "bg-[#eef3ff]"
        } ${clickToUpload ? "cursor-pointer hover:border-[#1652d9]" : ""} ${frameClassName}`}
      >
        {url ? (
          <img src={url} alt={productName || "Product photo"} className="absolute inset-0 h-full w-full object-contain p-2" />
        ) : isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        ) : canEdit ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
              <UploadCloud className="h-5 w-5 text-[#1652d9]" />
            </span>
            <span className="text-xs font-semibold text-slate-700">Drag & drop up to {MAX_PRODUCT_IMAGES} product photos here</span>
            <span className="text-[10px] text-slate-400">or click to browse — JPG, PNG, WEBP</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <img src={LOGO} alt="" className="h-14 w-14 rounded object-contain" />
            <span className="text-[10px] text-slate-400">Genuine product from Madhuram Motors</span>
          </div>
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white"
              aria-label="Next photo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold text-white">
              {selectedIndex + 1} / {images.length}
            </span>
          </>
        )}

        {canEdit && selected && (
          <div className="absolute left-2 top-2 flex gap-1.5">
            {selectedIndex === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#1652d9] px-2 py-0.5 text-[10px] font-bold text-white shadow">
                <Star className="h-3 w-3 fill-current" /> Cover
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => coverMutation.mutate(selected.id)}
                className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white disabled:opacity-50"
              >
                <Star className="h-3 w-3" /> Set as cover
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Remove this product photo?")) removeMutation.mutate(selected.id);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-rose-600 shadow ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="h-6 w-6 animate-spin text-[#3d6fe0]" />
          </div>
        )}
      </div>

      {(images.length > 1 || (canEdit && images.length > 0)) && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {images.map((img, i) => (
            <Thumb key={img.id} productId={productId} imageId={img.id} active={i === selectedIndex} isCover={i === 0} onClick={() => setSelectedId(img.id)} />
          ))}
          {canEdit && slotsLeft > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-[#9db6f2] bg-[#eef3ff] text-[#1652d9] hover:border-[#1652d9] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span className="text-[9px] font-semibold">Add</span>
            </button>
          )}
        </div>
      )}

      {canEdit && (
        <>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <p className="mt-1.5 text-[10px] text-slate-400">
            {images.length}/{MAX_PRODUCT_IMAGES} photos · the first is the cover · drag & drop to add
          </p>
        </>
      )}

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#1652d9] bg-[#1652d9]/10 text-[#1652d9] backdrop-blur-[1px]">
          <UploadCloud className="h-7 w-7" />
          <span className="text-xs font-bold">{slotsLeft > 0 ? `Drop to add (up to ${slotsLeft} more)` : `Max ${MAX_PRODUCT_IMAGES} photos reached`}</span>
        </div>
      )}
    </div>
  );
};

export default ProductImageUpload;
