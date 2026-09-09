import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon, ChevronDown } from "lucide-react";
import { type ProductData } from "@/services/product.service";

interface ProductSearchSelectProps {
  products: ProductData[];
  value: number | "";
  onChange: (productId: number | "") => void;
  disabled?: boolean;
  isLoading?: boolean;
  title?: string;
  /** Name to display when `value` doesn't match any product in `products` — e.g. an existing
   *  sale item whose product fell outside the loaded catalog (inactive, or past the page cap). */
  fallbackLabel?: string;
}

const productLabel = (p: ProductData) => {
  const suffix =
    p.productType === "SOFTWARE"
      ? "(Software)"
      : p.productType === "HARDWARE_ORDER_BASED"
        ? "(Order-Based Hardware)"
        : `(Available Stock: ${p.available})`;
  return `${p.name} ${suffix}`;
};

// Typeahead replacement for the old <select>, filtering client-side over the same `products`
// array (the already-fetched active catalog) the stock/type badges next to this field use —
// no extra network round-trip per keystroke since that list is loaded once for the whole form.
const ProductSearchSelect = ({ products, value, onChange, disabled, isLoading, title, fallbackLabel }: ProductSearchSelectProps) => {
  const selected = products.find((p) => p.id === Number(value));
  const displayLabel = selected ? productLabel(selected) : fallbackLabel || "";
  const [query, setQuery] = useState(displayLabel);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep the displayed text in sync when the selection changes from outside this input (e.g.
  // switching which sale is being edited, or the products list finishing its load after the
  // row's productId was already set).
  const [prevValue, setPrevValue] = useState(value);
  const [prevDisplayLabel, setPrevDisplayLabel] = useState(displayLabel);
  if (value !== prevValue || displayLabel !== prevDisplayLabel) {
    setPrevValue(value);
    setPrevDisplayLabel(displayLabel);
    setQuery(displayLabel);
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(displayLabel);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [displayLabel]);

  const trimmedQuery = query.trim().toLowerCase();
  const isQueryTheSelectedLabel = !!selected && trimmedQuery === productLabel(selected).toLowerCase();
  const results = trimmedQuery && !isQueryTheSelectedLabel
    ? products.filter((p) => p.name.toLowerCase().includes(trimmedQuery))
    : products;

  return (
    <div ref={wrapperRef} className="relative">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        disabled={disabled}
        title={title}
        placeholder="Search product..."
        autoComplete="off"
        onFocus={() => !disabled && setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          if (!e.target.value) onChange("");
        }}
        className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
      />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-slate-400">Loading products...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matching products</div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setQuery(productLabel(p));
                  setIsOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                  Number(value) === p.id ? "bg-blue-50 text-blue-700" : "text-slate-700"
                }`}
              >
                {productLabel(p)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchSelect;
