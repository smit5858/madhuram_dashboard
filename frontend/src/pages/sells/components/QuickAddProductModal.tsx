import { useState } from "react";
import { PackagePlus, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import productService from "@/services/product.service";

export interface QuickAddProductResult {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface QuickAddProductModalProps {
  onClose: () => void;
  onAdd: (result: QuickAddProductResult) => void;
}

/** Adds a one-off product line to just the current Sells Entry without polluting the Product
 *  Master catalog. Creates a real Product row (isMasterProduct: false, productType:
 *  HARDWARE_ORDER_BASED) via the existing /products endpoint — this reuses the exact same
 *  scoped-product mechanism already used for the pinned "Other" placeholder product, so stock
 *  reservation, Courier creation, and catalog exclusion all work with no special-casing. */
const QuickAddProductModal = ({ onClose, onAdd }: QuickAddProductModalProps) => {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Product name is required");
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!quantity || isNaN(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    const parsedPrice = Number(price);
    if (price.trim() === "" || isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error("Price is required and cannot be negative");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await productService.createProduct({
        name: trimmedName,
        productType: "HARDWARE_ORDER_BASED",
        isMasterProduct: false,
      });
      const productId = res.data?.data?.id;
      if (!productId) {
        throw new Error("Product creation did not return an id");
      }
      onAdd({
        productId,
        name: trimmedName,
        quantity: parsedQuantity,
        price: parsedPrice,
        notes: notes.trim() || undefined,
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to add product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <PackagePlus className="h-4 w-4 text-blue-600" />
            Quick Add Product
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-[10px] text-slate-400">
          A one-off item for this sale only — it won't be added to the Product Master catalog or become selectable on future sales.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Special Diagnostic Cable"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity *</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Price / Unit (₹) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Customer requested additional cable"
              rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-[#3d6fe0] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
          >
            {isSubmitting ? "Adding..." : "Add Product"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuickAddProductModal;
