import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone as PhoneIcon } from "lucide-react";
import customerService, { type CustomerData } from "@/services/customer.service";
import { useDebounce } from "@/hook/useDebounce";

interface CustomerAutocompleteFieldProps {
  label?: string;
  value: string;
  onPhoneChange: (phone: string) => void;
  onSelectCustomer: (customer: CustomerData) => void;
  error?: string;
}

// Same "search-as-you-type against the real API" pattern as ProductAutocompleteField (reuses
// GET /customers?search= — the Sells entry form's customer lookup — rather than a dedicated
// endpoint), plus arrow-key navigation over the suggestion list since a phone-number field is
// typically driven by keyboard rather than the mouse.
const CustomerAutocompleteField = ({ label = "Phone Number", value, onPhoneChange, onSelectCustomer, error }: CustomerAutocompleteFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debouncedPhone = useDebounce(value, 350);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
    queryKey: ["customer-autocomplete", debouncedPhone],
    queryFn: ({ signal }) => customerService.getCustomers({ search: debouncedPhone, limit: 6 }, { signal }),
    enabled: isOpen && debouncedPhone.trim().length >= 2,
  });

  const results = data?.data?.data || [];

  // Reset the keyboard cursor whenever a new search starts, so a stale index from the previous
  // query can't land on the wrong row (or point past the new, shorter list). Adjusted during
  // render rather than in an effect (same pattern as ProductAutocompleteField's prevInitialLabel)
  // to avoid the extra render pass a setState-in-effect would cause.
  const [prevDebouncedPhone, setPrevDebouncedPhone] = useState(debouncedPhone);
  if (debouncedPhone !== prevDebouncedPhone) {
    setPrevDebouncedPhone(debouncedPhone);
    setHighlightedIndex(-1);
  }

  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const selectCustomer = (customer: CustomerData) => {
    onSelectCustomer(customer);
    setIsOpen(false);
  };

  const showDropdown = isOpen && debouncedPhone.trim().length >= 2;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        e.preventDefault();
        selectCustomer(results[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="form-input-label">{label}</label>
      <div className="form-input-wrapper relative">
        <PhoneIcon className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={value}
          placeholder="10-digit number"
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10));
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{ paddingLeft: "2.25rem" }}
          className={`form-input ${error ? "form-input-error" : ""}`}
        />
      </div>
      {error && <div className="formik-input-error">{error}</div>}

      {showDropdown && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isFetching ? (
            <div className="px-3 py-2 text-xs text-slate-400">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matching customers</div>
          ) : (
            results.map((customer, index) => (
              <button
                key={customer.id}
                ref={(el) => { itemRefs.current[index] = el; }}
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectCustomer(customer)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                  index === highlightedIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div>
                  <p className="font-semibold">{customer.name}</p>
                  <p className="text-[11px] text-blue-600 font-mono">{customer.phone}</p>
                </div>
                {customer.city && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{customer.city}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerAutocompleteField;
