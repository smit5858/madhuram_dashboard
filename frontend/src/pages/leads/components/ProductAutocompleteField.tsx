import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import productService from "@/services/product.service";
import { useDebounce } from "@/hook/useDebounce";

interface ProductAutocompleteFieldProps {
  label?: string;
  value: number | string | undefined;
  /** Product name to show in the input until the user starts typing a new search. */
  initialLabel?: string;
  onChange: (productId: number, productName: string) => void;
  error?: string;
}

// No dedicated product-search endpoint exists — reuses GET /products?search= (same one the
// Products page's own filter bar calls) with a debounced query, same pattern as PendingBill.tsx's
// FilterSync, rather than bulk-fetching the whole catalog client-side.
const ProductAutocompleteField = ({ label = "Product", value, initialLabel, onChange, error }: ProductAutocompleteFieldProps) => {
  const [query, setQuery] = useState(initialLabel || "");
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Resync the displayed text when the parent hands us a different initial product (e.g.
  // switching which lead is being edited) — adjusted during render rather than in an effect,
  // per React's guidance for deriving state from a changed prop without an extra render pass.
  const [prevInitialLabel, setPrevInitialLabel] = useState(initialLabel);
  if (initialLabel !== prevInitialLabel) {
    setPrevInitialLabel(initialLabel);
    setQuery(initialLabel || "");
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["product-autocomplete", debouncedQuery],
    queryFn: ({ signal }) => productService.getProducts({ search: debouncedQuery, status: "active", limit: 20 }, { signal }),
    enabled: isOpen && debouncedQuery.trim().length > 0,
  });

  const results = data?.data?.data || [];

  return (
    <div ref={wrapperRef} className="relative">
      <label className="form-input-label">{label}</label>
      <div className="form-input-wrapper relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          placeholder="Type a product name..."
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (!e.target.value) onChange(0, "");
          }}
          // `.form-input`'s plain-CSS `padding: 0 14px` (custom.css) loads after Tailwind's
          // utilities and overrides a `pl-*` class of the same specificity — inline style is the
          // only reliable way to widen just the left padding without touching that shared class.
          style={{ paddingLeft: "2.25rem" }}
          className={`form-input ${error ? "form-input-error" : ""}`}
        />
      </div>
      {error && <div className="formik-input-error">{error}</div>}

      {isOpen && debouncedQuery.trim() && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isFetching ? (
            <div className="px-3 py-2 text-xs text-slate-400">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matching products</div>
          ) : (
            results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onChange(product.id, product.name);
                  setQuery(product.name);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                  value === product.id ? "bg-blue-50 text-blue-700" : "text-slate-700"
                }`}
              >
                <span>{product.name}</span>
                <span className="text-[10px] text-slate-400">Stock: {product.currentStock}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ProductAutocompleteField;
