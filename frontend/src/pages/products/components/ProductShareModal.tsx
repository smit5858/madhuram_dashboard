import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check, ChevronDown, ChevronUp, Download, Loader2, MessageCircle, RotateCcw, Share2, XCircle } from "lucide-react";
import { blurNumberInputOnWheel } from "@/shared/utils/input";
import LOGO from "@/assets/logo.png";
import productService, { type ProductData, type ProductImageRef } from "@/services/product.service";
import { useProductImages } from "@/hook/useProductImage";
import { useDebounce } from "@/hook/useDebounce";
import ProductImageUpload from "@/pages/products/components/ProductImageUpload";
import { canShareFiles, downloadBlob, getBlobErrorMessage, shareFile } from "@/shared/utils/fileShare";
import {
  SHARE_COMPANY_NAME,
  SHARE_TAGLINE,
  buildProductShareMessage,
  formatSharePrice,
  getProductWhatsAppUrl,
  productShareFileName,
  toCustomerProduct,
} from "@/pages/products/utils/productShare";

interface ProductShareModalProps {
  product: ProductData;
  onClose: () => void;
  /** Products "update" permission — lets the user add/change the photo right from the preview. */
  canEditImage: boolean;
  onImageChange?: (images: ProductImageRef[]) => void;
}

/** Descriptions longer than this (or with many lines) are collapsed behind "Read more" in the preview. */
const DESCRIPTION_PREVIEW_CHARS = 260;
const DESCRIPTION_PREVIEW_LINES = 4;

/** Share action on the Products table — previews a customer-facing catalogue card built only from
 *  whitelisted fields (see toCustomerProduct), then shares it via WhatsApp, the device share sheet
 *  (PDF file), or a PDF download. Purchase price, dealer, serials and stock info never appear. */
const ProductShareModal = ({ product, onClose, canEditImage, onImageChange }: ProductShareModalProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const baseProduct = useMemo(() => toCustomerProduct(product), [product]);

  // Share-only price: starts at the stored selling price and can be changed for this share. It is
  // never saved — it only feeds the preview, the WhatsApp text and the generated PDF (?price=).
  // An empty field hides the price entirely.
  const storedPriceText = baseProduct.sellingPrice !== null ? String(baseProduct.sellingPrice) : "";
  const [priceText, setPriceText] = useState(storedPriceText);
  const parsedPrice = Number(priceText);
  const sharePrice = priceText.trim() !== "" && Number.isFinite(parsedPrice) && parsedPrice > 0 ? Math.round(parsedPrice * 100) / 100 : null;
  const isPriceInvalid = priceText.trim() !== "" && sharePrice === null;
  const isPriceEdited = priceText !== storedPriceText;
  const cp = useMemo(() => ({ ...baseProduct, sellingPrice: sharePrice }), [baseProduct, sharePrice]);
  // 0 tells the backend to hide the price; omitted means "use the stored price".
  const pdfPrice = isPriceEdited ? sharePrice ?? 0 : undefined;
  const debouncedPdfPrice = useDebounce(pdfPrice, 500);

  // Same per-photo cache ProductImageUpload renders from — the blobs are attached to native shares.
  const { blobs: photoBlobs } = useProductImages(product.id, product.images);
  const photoKey = (product.images ?? []).map((img) => img.id).join(",");

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const descriptionParas = cp.description ? cp.description.split("\n") : [];
  const isDescriptionLong =
    (cp.description?.length ?? 0) > DESCRIPTION_PREVIEW_CHARS || descriptionParas.length > DESCRIPTION_PREVIEW_LINES;

  // Prefetched where file sharing is supported: navigator.share must run close to the user's tap,
  // so the PDF has to be ready before the click rather than downloaded inside the handler. Keyed on
  // the photo and share price too, so the shared PDF always matches the preview.
  const { data: prefetchedPdf } = useQuery({
    queryKey: ["product-share-pdf", product.id, product.updatedAt, photoKey, debouncedPdfPrice],
    queryFn: async () => (await productService.downloadProductSharePdf(product.id, debouncedPdfPrice)).data,
    enabled: canShareFiles && !isPriceInvalid,
    staleTime: 60_000,
  });

  // Reuse the prefetched PDF only when it was built with the price currently on screen.
  const getPdfBlob = async () =>
    new Blob(
      [prefetchedPdf && debouncedPdfPrice === pdfPrice ? prefetchedPdf : (await productService.downloadProductSharePdf(product.id, pdfPrice)).data],
      { type: "application/pdf" }
    );

  const handleWhatsApp = () => {
    window.open(getProductWhatsAppUrl(cp), "_blank", "noopener,noreferrer");
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      downloadBlob(await getPdfBlob(), productShareFileName(cp));
      toast.success("Product PDF downloaded");
    } catch (err) {
      toast.error(await getBlobErrorMessage(err, "Failed to download product PDF"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    setIsSharing(true);
    try {
      const pdf = new File([await getPdfBlob()], productShareFileName(cp), { type: "application/pdf" });
      // Photos first so WhatsApp shows them as pictures; dropped if this device can't share them with the PDF.
      const base = productShareFileName(cp).replace(/\.pdf$/, "");
      const photos = photoBlobs.map(
        (blob, i) => new File([blob], `${base}${photoBlobs.length > 1 ? `_${i + 1}` : ""}.jpg`, { type: blob.type || "image/jpeg" })
      );
      const files = photos.length && navigator.canShare?.({ files: [...photos, pdf] }) ? [...photos, pdf] : [pdf];
      await shareFile(files, { title: `${cp.name} — ${SHARE_COMPANY_NAME}`, text: buildProductShareMessage(cp) });
    } catch (err) {
      toast.error(await getBlobErrorMessage(err, "Failed to share product"));
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-slate-100 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Share2 className="h-4 w-4 text-[#3d6fe0]" />
            Share Product
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* Share-only price — not saved to the product. */}
          <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="share-price" className="text-xs font-semibold text-slate-700">Price to share</label>
              {isPriceEdited && (
                <button
                  type="button"
                  onClick={() => setPriceText(storedPriceText)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3d6fe0] hover:underline"
                >
                  <RotateCcw className="h-3 w-3" /> Reset{baseProduct.sellingPrice !== null ? ` to ${formatSharePrice(baseProduct.sellingPrice)}` : ""}
                </button>
              )}
            </div>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₹</span>
              <input
                id="share-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                onWheel={blurNumberInputOnWheel}
                placeholder="No price"
                className={`w-full rounded-lg border bg-slate-50 py-2 pl-7 pr-3 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none ${
                  isPriceInvalid ? "border-rose-400 focus:border-rose-500" : "border-slate-200 focus:border-[#3d6fe0]"
                }`}
              />
            </div>
            <p className={`mt-1 text-[10px] ${isPriceInvalid ? "text-rose-600" : "text-slate-400"}`}>
              {isPriceInvalid
                ? "Enter a valid amount greater than 0"
                : "Only for this share — the product's saved price is not changed. Leave empty to hide the price."}
            </p>
          </div>

          {/* Catalogue card preview — same design as the PDF; always light, independent of the app theme. */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-md border border-slate-200">
            {/* Header band */}
            <div className="relative overflow-hidden bg-gradient-to-r from-[#0b1f4d] to-[#1652d9] px-5 pt-5 pb-16">
              <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-1 shadow-sm">
                    <img src={LOGO} alt="" className="h-9 w-9 rounded-lg object-contain" />
                  </div>
                  <div>
                    <p className="text-base font-bold leading-tight text-white">{SHARE_COMPANY_NAME}</p>
                    <p className="text-[11px] text-blue-200">{SHARE_TAGLINE}</p>
                  </div>
                </div>
                <span className="mt-1 text-[9px] font-bold tracking-[0.15em] text-blue-200">PRODUCT CATALOGUE</span>
              </div>
            </div>

            <div className="px-5 pb-6">
              {/* Photo card overlapping the header — the real product photo, or a branded placeholder. */}
              <div className="-mt-12 relative rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
                <ProductImageUpload
                  key={product.id}
                  productId={product.id}
                  images={product.images}
                  productName={cp.name}
                  canEdit={canEditImage}
                  onChange={onImageChange}
                  frameClassName="aspect-[4/3]"
                />
              </div>

              <h4 className="mt-5 text-xl font-bold leading-snug text-slate-900 wrap-break-word">{cp.name}</h4>
              <div className="mt-2 h-1 w-10 rounded-full bg-[#1652d9]" />

              {cp.sellingPrice !== null && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#0b1f4d] to-[#1652d9] px-5 py-3.5 text-white shadow-md">
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.15em] text-blue-200">OUR PRICE</p>
                    <p className="text-2xl font-bold tabular-nums">{formatSharePrice(cp.sellingPrice)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#1652d9]">
                    <Check className="h-3 w-3" strokeWidth={3} /> GENUINE PRODUCT
                  </span>
                </div>
              )}

              {cp.description && (
                <div className="mt-5">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <span className="h-3.5 w-1 rounded-full bg-[#1652d9]" /> About this product
                  </p>
                  <div className="relative mt-2">
                    <div className={`space-y-1.5 ${isDescriptionLong && !isDescriptionExpanded ? "max-h-28 overflow-hidden" : ""}`}>
                      {descriptionParas.map((para, i) => (
                        <p key={i} className="text-xs leading-relaxed text-slate-600 wrap-break-word">{para}</p>
                      ))}
                    </div>
                    {isDescriptionLong && !isDescriptionExpanded && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-white to-transparent" />
                    )}
                  </div>
                  {isDescriptionLong && (
                    <button
                      type="button"
                      onClick={() => setIsDescriptionExpanded((v) => !v)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#1652d9] hover:underline"
                    >
                      {isDescriptionExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isDescriptionExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </div>
              )}

              {cp.features.length > 0 && (
                <div className="mt-5">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <span className="h-3.5 w-1 rounded-full bg-[#1652d9]" /> Key Features
                  </p>
                  <ul className="mt-2 space-y-2 rounded-xl bg-[#eef3ff] p-3.5">
                    {cp.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-slate-800">
                        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1652d9]">
                          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                        </span>
                        <span className="wrap-break-word">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer band */}
            <div className="bg-gradient-to-r from-[#0b1f4d] to-[#1652d9] px-5 py-4 text-center">
              <p className="text-xs font-bold text-white">Contact us for more details or to place your order.</p>
              <p className="mt-1 text-[11px] text-blue-200">Thank you for choosing {SHARE_COMPANY_NAME}!</p>
              <p className="mt-1.5 text-[10px] text-blue-200/80">{SHARE_COMPANY_NAME} • {SHARE_TAGLINE}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))] rounded-b-2xl">
          <button
            type="button"
            disabled={isPriceInvalid}
            onClick={handleWhatsApp}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          {canShareFiles && (
            <button
              type="button"
              disabled={isSharing || isPriceInvalid}
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-2 text-xs font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
            >
              {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share PDF
            </button>
          )}
          <button
            type="button"
            disabled={isDownloading || isPriceInvalid}
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductShareModal;
