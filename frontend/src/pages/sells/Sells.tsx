import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, RotateCcw, Trash2, Eye, Edit2, AlertTriangle, CheckCircle2, XCircle, Package, PackagePlus, IndianRupee, ShoppingBag, Search as SearchIcon, Download, ChevronDown, UserCheck, Loader2 } from "lucide-react";
import { Formik, Form, Field, useFormikContext } from "formik";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import saleService, {
  type SaleData,
  type SaleItemData,
  type CreateSalePayload,
  type SalesFilters,
  type SellsTotalsData,
  type PaymentEntry,
  type PaymentData,
} from "../../services/sells.service";
import productService, {
  type ProductData,
} from "../../services/product.service";
import customerService, { type CustomerData } from "../../services/customer.service";
import bankAccountService from "../../services/bankAccount.service";
import courierCompanyService from "../../services/courierCompany.service";
import platformService from "../../services/platform.service";
import { COURIER_COMPANY_OTHER } from "@/shared/constants/courierCompanies";
import CancelSaleModal from "@/shared/components/CancelSaleModal";
import StockShortageModal, { type StockShortageItem } from "@/pages/sells/components/StockShortageModal";
import QuickAddProductModal, { type QuickAddProductResult } from "@/pages/sells/components/QuickAddProductModal";
import ProductSearchSelect from "@/pages/sells/components/ProductSearchSelect";
import PaymentsEditor from "@/pages/sells/components/PaymentsEditor";
import { validatePaymentRows, sumPaymentRows, needsBankAccount, PAYMENT_ENTRY_METHODS, type PaymentRow, type PaymentEntryMethod } from "@/pages/sells/utils/paymentRows";
import { blurNumberInputOnWheel } from "@/shared/utils/input";
import { formatDisplayDate, getTodayISODate } from "@/shared/utils/date";

interface FormItem {
  /** Set only for a line that already exists as a SaleItem on the backend (populated when
   *  opening Edit) — undefined for a row added locally in this session, not yet persisted. */
  id?: number;
  productId: number | "";
  quantity: number | "";
  sellingPrice: number | "";
  /** Product name captured from the sale record itself — used as the autocomplete's display
   *  fallback when this product isn't in the loaded active-catalog list (e.g. now inactive). */
  productName?: string;
  /** Free-text note — currently only editable for Quick Add Product lines (see
   *  QuickAddProductModal), but stored generically on the line item. */
  notes?: string;
  /** True for a line created via "Quick add product" — set explicitly at creation time (and
   *  re-derived from Product.isMasterProduct when hydrating an existing sale's items, see
   *  openEditModal) so the Product field can render the entered name as a plain value instead
   *  of the searchable picker, without depending on whether the separate active-catalog
   *  products query has refetched yet. */
  isQuickProduct?: boolean;
  /** Stable React list key, independent of array position — rows can be deleted from the
   *  middle, and an index-based key would make React reuse a ProductSearchSelect instance
   *  (which keeps its own internal display-text state) for a different row, leaving stale
   *  text behind even though its value/badges (driven purely by props) update correctly. */
  _key: string;
}

let formItemKeySeq = 0;
const nextFormItemKey = () => `item-${++formItemKeySeq}`;

// A row the user hasn't actually put a product into yet — no product picked, no name captured,
// not a Quick Add line, and not already persisted. `productId === ""` alone isn't enough to mean
// "empty": a Quick Add line intentionally carries a real Product id (see QuickAddProductModal)
// but is still a fully valid line, so this checks the row's shape instead of just the id.
const isEmptyProductRow = (item: FormItem) =>
  !item.id && !item.productId && !item.productName && !item.isQuickProduct;

// Converts draft payment rows to the wire shape without re-validating — used to build the actual
// submit payload once handleSubmit's validatePaymentRows call has already confirmed the rows are
// valid (including via the stock-shortage resolution paths, which reuse that same validated state).
const toPaymentEntries = (rows: PaymentRow[]): PaymentEntry[] =>
  rows
    .filter((row) => row.amount.trim() !== "" && Number(row.amount) !== 0)
    .map((row) => ({
      method: row.method,
      amount: Number(row.amount),
      bankAccountId: (row.method === "BankTransfer" || row.method === "UPI") && row.bankAccountId ? Number(row.bankAccountId) : null,
      transactionRef: row.transactionRef.trim() || null,
    }));

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CANCELLED", label: "Cancelled" },
];

// The selectable Sales Platform list comes from the backend-managed Platform module (see
// services/platform.service.ts, shared with the Lead form's platform picker). "Repeat" and
// "Other" are always appended locally as fixed options — see resolvedPlatform below — never
// persisted as a Platform row.
const PLATFORM_REPEAT = "Repeat";
const PLATFORM_OTHER = "Other";

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<SalesFilters>>;
}) => {
  const { values } = useFormikContext<{ search: string; startDate: string; endDate: string; status: string }>();
  const debouncedSearch = useDebounce(values.search, 400);

  // The one search box filters by the customer's name or phone number, as stored directly on the
  // Sale record (see sells.controller.js#buildSalesWhere) — works alongside every other
  // filter/pagination as usual.
  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, customerName: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
      status: values.status || undefined,
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.startDate, values.endDate, values.status]);

  return null;
};

const Sells = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const auth = useSelector((state: RootState) => state.auth);
  const { permissions } = auth;

  // Permission derivation
  const pagePermission = useMemo(() => {
    if (!permissions)
      return {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        viewAllRecords: false,
      };
    const p = permissions.find(
      (p) =>
        p.routePath.toLowerCase() === "/sells" ||
        p.routeName.toLowerCase() === "sells"
    );
    return (
      p ?? {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        viewAllRecords: false,
      }
    );
  }, [permissions]);

  // Permission-driven, not role-name-driven: this module (via role or per-user override)
  // is granted visibility into every user's Sales, not just their own — see backend
  // helper/permissionScope.js.
  const canViewAllSales = pagePermission.viewAllRecords;

  // Lets the Sales/Admin dashboard's "Pending Orders"/"Completed Orders" KPIs land here
  // pre-filtered (e.g. ?status=PENDING).
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "";

  // Filters State
  const [appliedFilters, setAppliedFilters] = useState<SalesFilters>(initialStatus ? { status: initialStatus } : {});
  const [pageSize] = useState(10);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Query: Sells Totals (server-side authorization scoped)
  const { data: totalsResponse } = useQuery({
    queryKey: ["sells-totals", appliedFilters.userId],
    queryFn: () => saleService.getSellsTotals({ userId: appliedFilters.userId }),
    enabled: pagePermission.canRead,
  });

  const totalsData: SellsTotalsData = totalsResponse?.data?.data || {
    totalSellingAmount: 0,
    totalCollectedAmount: 0,
    totalPendingAmount: 0,
    totalSalesCount: 0,
  };

  // Query: Sells List
  const {
    data: sellsResponse,
    isLoading: isSellsLoading,
    error: sellsError,
  } = useQuery({
    queryKey: ["sells", appliedFilters, pageSize],
    queryFn: ({ signal }) =>
      saleService.getSales(
        { ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize },
        { signal }
      ),
    enabled: pagePermission.canRead,
  });

  // Query: Products List (for dropdowns and stock display) — only active/sellable products.
  // The product picker needs the ENTIRE active catalog, not one page of it, but the backend
  // caps a single request's `limit` at 100 (see product.controller.js#getProducts) — so a shop
  // with more than 100 active products previously had everything past the first page silently
  // missing from Add/Edit Sale's product search. Page 1 is fetched first; if `meta.totalPages`
  // says there's more, the rest are fetched in parallel and merged so the full catalog is always
  // loaded before the picker filters/searches over it.
  const { data: productsResponse, isLoading: isProductsLoading } = useQuery({
    queryKey: ["products", "active-catalog"],
    queryFn: async ({ signal }) => {
      const limit = 100;
      const first = await productService.getProducts({ status: "active", limit, page: 1 }, { signal });
      const totalPages = first.data?.meta?.totalPages || 1;
      if (totalPages <= 1) return first;

      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      const rest = await Promise.all(
        remainingPages.map((page) => productService.getProducts({ status: "active", limit, page }, { signal }))
      );
      const mergedData = [first, ...rest].flatMap((r) => r.data?.data || []);
      return { ...first, data: { ...first.data, data: mergedData } };
    },
  });

  // Query: active Bank Accounts (for the Bank Account dropdown shown when Payment Method =
  // BankTransfer) — configured under Account → Manage Bank Account Details.
  const { data: bankAccountsResponse } = useQuery({
    queryKey: ["bank-accounts-active"],
    queryFn: () => bankAccountService.getActiveBankAccounts(),
    enabled: pagePermission.canRead,
  });
  const bankAccountsList = bankAccountsResponse?.data?.data || [];

  // Query: active Courier Companies (for the optional Courier field below) — same
  // Admin-managed list used by the Courier module's own company picker.
  const { data: courierCompaniesResponse } = useQuery({
    queryKey: ["courier-companies-picker"],
    queryFn: () => courierCompanyService.getCourierCompanies(),
    enabled: pagePermission.canCreate || pagePermission.canUpdate,
  });
  const courierCompaniesList = (courierCompaniesResponse?.data?.data || []).filter((c) => c.isActive !== false);
  const COURIER_COMPANY_OPTIONS = [
    { value: "", label: "None" },
    ...courierCompaniesList.map((c) => ({ value: c.name, label: c.name })),
    { value: COURIER_COMPANY_OTHER, label: COURIER_COMPANY_OTHER },
  ];

  // Query: active Sales Platforms — same Admin-managed list (Settings → Platform Management)
  // used by the Lead form's platform picker. "Other" is appended locally, always last, and
  // de-duplicated in case a Platform row is itself literally named "Other".
  const { data: platformsResponse } = useQuery({
    queryKey: ["platforms-picker", "active"],
    queryFn: () => platformService.getPlatforms({ status: "active" }),
    enabled: pagePermission.canCreate || pagePermission.canUpdate,
  });
  const dynamicPlatformNames = (platformsResponse?.data?.data || [])
    .map((p) => p.name)
    .filter((name) => {
      const normalized = name.trim().toLowerCase();
      return normalized !== PLATFORM_OTHER.toLowerCase() && normalized !== PLATFORM_REPEAT.toLowerCase();
    });
  const PLATFORM_OPTIONS = [...dynamicPlatformNames, PLATFORM_REPEAT, PLATFORM_OTHER];

  const productsListData = productsResponse?.data?.data;
  const productsList: ProductData[] = useMemo(() => productsListData || [], [productsListData]);
  const sellsList: SaleData[] = sellsResponse?.data?.data || [];

  const paginationMeta = sellsResponse?.data?.meta || {
    page: appliedFilters.page ?? 1,
    totalPages: 1,
    total: sellsList.length,
  };

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleData | null>(null);
  // Set to a sale's id while handleEditClick is fetching its full detail (payment history
  // included) before opening Edit — the list query row itself doesn't carry `payments`.
  const [loadingEditSaleId, setLoadingEditSaleId] = useState<number | null>(null);

  // Stock-shortage confirm prompt (create flow only) — snapshots the items being submitted so
  // the user's chosen resolution ("available only" / "all products") applies to exactly what
  // triggered the prompt, even if they keep editing the form underneath it.
  const [stockShortagePrompt, setStockShortagePrompt] = useState<{
    shortages: StockShortageItem[];
    snapshotItems: FormItem[];
  } | null>(null);

  // Form State
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerLookupStatus, setCustomerLookupStatus] = useState<
    "idle" | "loading" | "found" | "not_found"
  >("idle");
  const [foundCustomerInfo, setFoundCustomerInfo] = useState<string | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerData[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [platform, setPlatform] = useState("Direct Store");
  // Free-text sibling for the platform select's "Other" option — mirrors otherCourierName below.
  const [otherPlatformName, setOtherPlatformName] = useState("");
  const [to, setTo] = useState("Madhuram Motor");
  // Optional courier company, picked at entry time — seeds Courier.courierName on the
  // record(s) created for this sale but is never required and stays freely editable
  // afterward from the Courier module.
  const [courierName, setCourierName] = useState("");
  const [otherCourierName, setOtherCourierName] = useState("");
  // Optional shipping/courier charge for this sale — a plain numeric string like collectedAmount,
  // defaults to "0" (no charge), never allowed to go negative (see handleSubmit's validation).
  const [courierCharge, setCourierCharge] = useState<string>("0");
  // Draft payment-method rows for this form session — for a new sale, this IS the whole
  // collected amount; for an existing sale, these are NEW payment(s) added on top of whatever's
  // already been collected (see effectiveCollectedAmount below). Each row can use a different
  // method (e.g. part Cash, part UPI) — see PaymentsEditor.
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  // The sale's already-recorded Payment rows, loaded when opening Edit (see openEditModal) — shown
  // as an editable list (edit/delete) above the "Add Payment" rows for new entries. Empty for a
  // brand-new sale (nothing recorded yet).
  const [existingPayments, setExistingPayments] = useState<PaymentData[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editPaymentDraft, setEditPaymentDraft] = useState<{
    method: PaymentEntryMethod;
    amount: string;
    bankAccountId: number | "";
    transactionRef: string;
  }>({ method: "Cash", amount: "", bankAccountId: "", transactionRef: "" });
  const [deletePaymentConfirmId, setDeletePaymentConfirmId] = useState<number | null>(null);
  const [city, setCity] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [pincode, setPincode] = useState("");
  // Total Selling Amount — always a plain numeric string (never mixes a derived number with a
  // typed string, which is what let the field render literal "0" and mangle typed digits into
  // "05"-style values). `sellingAmountManuallyEdited` tracks whether the user has taken control
  // of the field (typed into it directly, or opened an existing sale) — while false, the effect
  // below keeps it mirroring the live items total; once true, it stops auto-tracking so a
  // deliberate override (e.g. a discount) sticks. Clearing the field hands control back to the
  // items total.
  const [manualSellingAmount, setManualSellingAmount] = useState<string>("0");
  const [sellingAmountManuallyEdited, setSellingAmountManuallyEdited] = useState(false);
  const [notes, setNotes] = useState("");
  // The date this sale actually happened on — defaults to today, editable, and shows the saved
  // value again when reopening an existing sale in Edit (see openEditModal).
  const [saleDate, setSaleDate] = useState(getTodayISODate());
  // Checked by default so the existing courier-entry behavior is unchanged unless the user
  // explicitly opts out (e.g. a walk-in sale that isn't shipped). On Edit, this is re-initialized
  // from the sale's actual current state (see openEditModal) instead of always defaulting true.
  const [createCourierEntry, setCreateCourierEntry] = useState(true);

  // Cancel-sale confirmation (with the defective/write-off option) — id of the sale awaiting confirmation.
  const [cancelSaleId, setCancelSaleId] = useState<number | null>(null);
  // Starts empty rather than with one blank placeholder row — an untouched placeholder used to
  // count as "row #1" (inflating Products Included, and getting caught by the "select a product
  // for row #1" validation the moment a Quick Add Product was added alongside it). The empty
  // state below prompts "+ Add Product" / "Quick add product" instead.
  const [items, setItems] = useState<FormItem[]>([]);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  // Snapshot of each existing line's quantity/price as loaded into Edit — lets handleSubmit
  // diff against the live `items` state and only send updateSaleItem for lines the user
  // actually changed.
  const [originalItemsById, setOriginalItemsById] = useState<Record<number, { quantity: number; sellingPrice: number; notes?: string }>>({});

  // The pinned "Other" product field option — a real, non-catalog Product row (isMasterProduct:
  // false, productType SOFTWARE) seeded once on the backend (see server.js#ensureOtherProductSeeded)
  // so it reuses the existing no-stock/no-courier SOFTWARE handling with no special-cased backend
  // logic. Placed first in the picker regardless of alphabetical order.
  const otherProduct = useMemo(
    () => productsList.find((p) => p.name === "Other" && p.isMasterProduct === false) || null,
    [productsList]
  );
  // The active-catalog query above intentionally fetches every Product row (no `masterOnly`
  // filter) because other lookups in this file (stock-shortage pre-check, existing Quick Add
  // rows' productType, etc.) need to resolve a Quick Add Product's own row by id. But that same
  // unfiltered list must never leak into the general search picker: a Quick Add Product
  // (isMasterProduct: false, name !== "Other" — see QuickAddProductModal) is scoped to the sale
  // it was created for, not a selectable Product Master catalog entry. Only real master products
  // plus the pinned "Other" placeholder (also isMasterProduct: false, but a deliberate catalog
  // exception — see server.js#ensureOtherProductSeeded) belong in the picker's suggestions.
  const productsListForPicker = useMemo(() => {
    const masterProducts = productsList.filter((p) => p.isMasterProduct !== false || p.name === "Other");
    if (!otherProduct) return masterProducts;
    return [otherProduct, ...masterProducts.filter((p) => p.id !== otherProduct.id)];
  }, [productsList, otherProduct]);

  // "Create Courier Entry" is locked off whenever every chosen line is the "Other" placeholder —
  // there's nothing physical in the sale to ship, so it can't accidentally stay selected. A mixed
  // cart (Other + a real product) leaves the checkbox alone since the real line(s) may still need
  // shipping — see the effect below, which forces it off on entering the locked state and restores
  // whatever the user had before on leaving it.
  const hasChosenItem = items.some((i) => !!i.productId);
  const hasRealProductItem = items.some((i) => i.productId && (!otherProduct || i.productId !== otherProduct.id));
  const isCourierEntryLocked = !!otherProduct && hasChosenItem && !hasRealProductItem;
  const wasCourierEntryLockedRef = useRef(false);
  const courierEntryBeforeLockRef = useRef(true);
  useEffect(() => {
    if (isCourierEntryLocked && !wasCourierEntryLockedRef.current) {
      courierEntryBeforeLockRef.current = createCourierEntry;
      wasCourierEntryLockedRef.current = true;
      setCreateCourierEntry(false);
    } else if (!isCourierEntryLocked && wasCourierEntryLockedRef.current) {
      wasCourierEntryLockedRef.current = false;
      setCreateCourierEntry(courierEntryBeforeLockRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCourierEntryLocked]);

  // Debounced Customer Phone Lookup & Autocomplete for Sells Entry
  const debouncedCustomerPhone = useDebounce(customerNumber, 350);

  useEffect(() => {
    // Only perform auto-lookup when adding a new sale (not editing)
    if (selectedSale) return;

    const cleanPhone = debouncedCustomerPhone.trim();
    if (cleanPhone.length >= 2) {
      let isMounted = true;
      if (cleanPhone.length >= 10) {
        setCustomerLookupStatus("loading");
      }

      customerService
        .getCustomers({ search: cleanPhone, limit: 6 })
        .then((res) => {
          if (!isMounted) return;
          const matches = res.data?.data || [];
          setCustomerSuggestions(matches);

          // Check if an exact 10-digit match exists
          const exactMatch = matches.find(
            (c) => c.phone === cleanPhone || (cleanPhone.length >= 10 && c.phone.endsWith(cleanPhone))
          );

          if (exactMatch) {
            setCustomerId(exactMatch.id || null);
            setCustomerLookupStatus("found");
            setFoundCustomerInfo(exactMatch.name);
            setCustomerName(exactMatch.name);
            if (exactMatch.city) setCity(exactMatch.city);
            if (exactMatch.address) setFromAddress(exactMatch.address);
            if (exactMatch.pincode) setPincode(exactMatch.pincode);
          } else if (cleanPhone.length >= 10) {
            setCustomerId(null);
            setCustomerLookupStatus("not_found");
            setFoundCustomerInfo(null);
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setCustomerSuggestions([]);
          if (cleanPhone.length >= 10) {
            setCustomerId(null);
            setCustomerLookupStatus("not_found");
            setFoundCustomerInfo(null);
          }
        });

      return () => {
        isMounted = false;
      };
    } else {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setCustomerLookupStatus("idle");
      setFoundCustomerInfo(null);
      setCustomerId(null);
    }
  }, [debouncedCustomerPhone, selectedSale]);

  const handleSelectCustomer = (cust: CustomerData) => {
    setCustomerId(cust.id || null);
    setCustomerNumber(cust.phone);
    setCustomerName(cust.name);
    if (cust.city) setCity(cust.city);
    if (cust.address) setFromAddress(cust.address);
    if (cust.pincode) setPincode(cust.pincode);
    setCustomerLookupStatus("found");
    setFoundCustomerInfo(cust.name);
    setShowSuggestions(false);
  };

  // Dynamic calculation of calculated selling amount based on items
  const calculatedItemsTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.sellingPrice) || 0;
      return sum + q * p;
    }, 0);
  }, [items]);

  // Keeps the Total Selling Amount field mirroring the items total in real time, as long as the
  // user hasn't taken manual control of it (see the state declaration above). This is the single
  // source of truth for what the field displays — it never falls back to computing a different
  // value at render time, which is what previously let the field show a stale/incorrect amount.
  // Adjusted during render (React's recommended pattern for "derive state from a changed value")
  // rather than in an Effect, so the field never flashes the stale amount for one frame.
  const [lastSyncedItemsTotal, setLastSyncedItemsTotal] = useState(calculatedItemsTotal);
  if (calculatedItemsTotal !== lastSyncedItemsTotal) {
    setLastSyncedItemsTotal(calculatedItemsTotal);
    if (!sellingAmountManuallyEdited) {
      setManualSellingAmount(String(calculatedItemsTotal));
    }
  }

  const effectiveSellingAmount = Number(manualSellingAmount) || 0;

  // Order Total = Total Selling Amount + Courier Charge — the actual figure payments are
  // measured against everywhere in this form (summary strip, remaining/overpaid, submission).
  const effectiveCourierCharge = Number(courierCharge) || 0;
  const effectiveOrderTotal = effectiveSellingAmount + effectiveCourierCharge;

  const paymentRowsTotal = useMemo(() => sumPaymentRows(paymentRows), [paymentRows]);

  // Creating a new sale: the draft payment rows ARE the whole collected amount. Editing an
  // existing sale: they're NEW payment(s) added on top of whatever's already been collected.
  const effectiveCollectedAmount = selectedSale ? Number(selectedSale.collectedAmount ?? 0) + paymentRowsTotal : paymentRowsTotal;

  // Overpaying the order total is allowed by design — remaining floors at 0 and the extra is
  // surfaced separately as overpaidAmount instead of blocking submission.
  const pendingAmount = Math.max(0, effectiveOrderTotal - effectiveCollectedAmount);
  const overpaidAmount = Math.max(0, effectiveCollectedAmount - effectiveOrderTotal);

  // Resolves the Courier field's select value ("Other" needs the free-text sibling state)
  // down to the plain string sent to the backend. Optional — an empty result is fine.
  const resolvedCourierName = courierName === COURIER_COMPANY_OTHER ? otherCourierName.trim() : courierName;

  // Resolves the Sales Platform select's value ("Other" needs the free-text sibling state) down
  // to the plain string sent to the backend.
  const resolvedPlatform = platform === PLATFORM_OTHER ? otherPlatformName.trim() : platform;

  // Mutation: Create Sale
  const createSaleMutation = useMutation({
    mutationFn: (payload: CreateSalePayload) => saleService.createSale(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Sells entry created successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      closeModal();
      const created = res.data?.data;
      if (created?.customerId && Number(created?.pendingAmount) > 0) {
        // Customer didn't pay in full — take the user straight to that customer's ledger/
        // debit account instead of the Sells list, so the outstanding balance is front and center.
        navigate(`/customers/${created.customerId}/ledger`);
      } else {
        // Fulfillment (line items, shipping, courier history) happens on the
        // Couriers page's "Pending Fulfillment" list — send the user there,
        // but don't auto-open anything; they pick the entry themselves.
        navigate("/sells");
      }
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message ||
        err.message ||
        "Failed to create sells entry"
      );
    },
  });

  // Mutation: Update Sale
  const updateSaleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<Partial<SaleData>, "payments"> & { payments?: PaymentEntry[] } }) =>
      saleService.updateSale(id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Sale updated successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || err.message || "Failed to update sale"
      );
    },
  });

  // Mutation: Add a product line to an existing sale (Edit flow only — new sales send their
  // full item list with the create call instead). No standalone toast/invalidate here; these
  // run as a batch from handleSubmit, which handles success/error once for the whole batch.
  const addSaleItemMutation = useMutation({
    mutationFn: ({ saleId, data }: { saleId: number; data: { productId: number; quantity: number; sellingPrice: number; notes?: string } }) =>
      saleService.addSaleItem(saleId, data),
  });

  // Mutation: Edit an existing sale line's price and/or quantity (Edit flow only). Same
  // batch-from-handleSubmit pattern as addSaleItemMutation above.
  const updateSaleItemMutation = useMutation({
    mutationFn: ({ saleId, itemId, data }: { saleId: number; itemId: number; data: { quantity?: number; sellingPrice?: number; notes?: string } }) =>
      saleService.updateSaleItem(saleId, itemId, data),
  });

  // Mutation: Delete Sale
  const deleteSaleMutation = useMutation({
    mutationFn: ({ id, defective, reason }: { id: number; defective?: boolean; reason?: string }) =>
      saleService.deleteSale(id, { defective, reason }),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Sale cancelled successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      // Cancelling releases/returns stock — the products catalog (available counts shown in
      // the item picker) must be refetched or it keeps showing the stale reserved/sold figure.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCancelSaleId(null);
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || err.message || "Failed to delete sale"
      );
    },
  });

  // Query: full sale detail (items with fulfillment/courier breakdown + payment history) —
  // the list query above only returns summary fields, so the detail modal fetches by id.
  const { data: saleDetailResponse, isFetching: isDetailLoading } = useQuery({
    queryKey: ["sale-detail", selectedSale?.id],
    queryFn: () => saleService.getSaleById(selectedSale!.id!),
    enabled: isDetailOpen && !!selectedSale?.id,
  });
  const saleDetail: SaleData | null = saleDetailResponse?.data?.data || null;
  // Prefer the freshly-fetched detail (has payments + per-item courier history);
  // fall back to the list-row summary while the detail query is still loading.
  const detail: SaleData | null = saleDetail ?? selectedSale;

  // "Record Payment" draft rows (inside the detail modal) — lets the remaining balance on an
  // existing sale be collected as more than one method at once (e.g. part Cash, part UPI).
  const [detailPaymentRows, setDetailPaymentRows] = useState<PaymentRow[]>([]);

  const recordPaymentsMutation = useMutation({
    mutationFn: ({ saleId, payments }: { saleId: number; payments: PaymentEntry[] }) => saleService.recordPayments(saleId, payments),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      queryClient.invalidateQueries({ queryKey: ["sale-detail", selectedSale?.id] });
      setDetailPaymentRows([]);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to record payment");
    },
  });

  // Refetches the full sale (including its payments) after an edit/delete so both the Existing
  // Payments list and the header totals (collectedAmount/pendingAmount/paymentStatus) shown in
  // this form reflect the change immediately, without closing the modal.
  const refreshEditingSale = async (saleId: number) => {
    try {
      const res = await saleService.getSaleById(saleId);
      const fresh = res.data?.data;
      if (fresh) {
        setSelectedSale(fresh);
        setExistingPayments(fresh.payments || []);
      }
    } catch {
      // Non-fatal — the mutation itself already succeeded and its own toast fired; the list
      // simply stays as it was until the next natural refresh (e.g. reopening the modal).
    }
  };

  const updatePaymentMutation = useMutation({
    mutationFn: ({
      saleId,
      paymentId,
      data,
    }: {
      saleId: number;
      paymentId: number;
      data: { amount?: number; method?: string; bankAccountId?: number | null; transactionRef?: string | null };
    }) => saleService.updatePayment(saleId, paymentId, data),
    onSuccess: async (res, variables) => {
      toast.success(res.data?.message || "Payment updated successfully");
      setEditingPaymentId(null);
      await refreshEditingSale(variables.saleId);
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to update payment");
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: ({ saleId, paymentId }: { saleId: number; paymentId: number }) => saleService.deletePayment(saleId, paymentId),
    onSuccess: async (res, variables) => {
      toast.success(res.data?.message || "Payment deleted successfully");
      setDeletePaymentConfirmId(null);
      await refreshEditingSale(variables.saleId);
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete payment");
    },
  });

  const resetForm = () => {
    setIsQuickAddOpen(false);
    setCustomerId(null);
    setCustomerLookupStatus("idle");
    setFoundCustomerInfo(null);
    setCustomerSuggestions([]);
    setShowSuggestions(false);
    setCustomerName("");
    setCustomerNumber("");
    setPlatform(PLATFORM_OPTIONS[0] || PLATFORM_OTHER);
    setOtherPlatformName("");
    setTo("Madhuram Motor");
    setCourierName("");
    setOtherCourierName("");
    setCourierCharge("0");
    setPaymentRows([]);
    setExistingPayments([]);
    setEditingPaymentId(null);
    setDeletePaymentConfirmId(null);
    setCity("");
    setFromAddress("");
    setPincode("");
    setManualSellingAmount("0");
    setSellingAmountManuallyEdited(false);
    setNotes("");
    setSaleDate(getTodayISODate());
    setCreateCourierEntry(true);
    setItems([]);
    setOriginalItemsById({});
    setSelectedSale(null);
    // Stale across sale open/close otherwise — the next sale (or a fresh Add) must start
    // unlocked, not carrying over whatever the previous sale's Other-lock state was.
    wasCourierEntryLockedRef.current = false;
    courierEntryBeforeLockRef.current = true;
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (sale: SaleData) => {
    setSelectedSale(sale);
    setCustomerId(sale.customerId || null);
    setCustomerLookupStatus(sale.customerNumber ? "found" : "idle");
    setFoundCustomerInfo(sale.customerName || null);
    setCustomerSuggestions([]);
    setShowSuggestions(false);
    setCustomerName(sale.customerName || "");
    setCustomerNumber(sale.customerNumber || "");
    const savedPlatform = sale.platform || "";
    const platformIsOther =
      !!savedPlatform && savedPlatform !== PLATFORM_REPEAT && !dynamicPlatformNames.includes(savedPlatform);
    setPlatform(
      savedPlatform ? (platformIsOther ? PLATFORM_OTHER : savedPlatform) : PLATFORM_OPTIONS[0] || PLATFORM_OTHER
    );
    setOtherPlatformName(platformIsOther ? savedPlatform : "");
    setTo(sale.to || "Madhuram Motor");
    const savedCourierName = sale.courierName || "";
    const courierNameIsOther = !!savedCourierName && !courierCompaniesList.some((c) => c.name === savedCourierName);
    setCourierName(courierNameIsOther ? COURIER_COMPANY_OTHER : savedCourierName);
    setOtherCourierName(courierNameIsOther ? savedCourierName : "");
    setCourierCharge(String(sale.courierCharge ?? 0));
    setSaleDate(sale.saleDate || (sale.createdAt ? sale.createdAt.slice(0, 10) : getTodayISODate()));
    // The draft payment rows start empty on Edit — they represent NEW payment(s) to add on top
    // of whatever's already been collected. The sale's actual payment history is loaded
    // separately below (existingPayments) and shown as its own editable list.
    setPaymentRows([]);
    setEditingPaymentId(null);
    setDeletePaymentConfirmId(null);
    // `sale.payments` is only populated when the caller fetched the full sale detail first (see
    // handleEditClick below) — the Sells list query itself doesn't include payment history.
    setExistingPayments(sale.payments || []);
    setCity(sale.city || "");
    setFromAddress(sale.fromAddress || "");
    setPincode(sale.pincode || "");
    // Prefer the saved sellingAmount, but fall back to the items' own total if it's missing/zero
    // (a legacy/bad record) so the field never opens showing an incorrect 0 — computed directly
    // from `sale.items` rather than the `calculatedItemsTotal` memo, since the `items` state
    // update below hasn't taken effect yet at this point in the function.
    const saleItemsTotal = (sale.items || []).reduce(
      (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0),
      0
    );
    const savedSellingAmount = Number(sale.sellingAmount) || 0;
    setManualSellingAmount(String(savedSellingAmount > 0 ? savedSellingAmount : saleItemsTotal));
    // Nothing meaningful saved yet (e.g. a Lead-originated sale that starts at ₹0 — see
    // lead.controller.js#ensureSaleForLead) — keep tracking the live items total as the Sales
    // member fills in real prices, instead of locking the field at the stale 0 they opened with.
    // A sale that already has a real recorded amount keeps it fixed (true) so editing items
    // doesn't silently overwrite an intentional discount/override.
    setSellingAmountManuallyEdited(savedSellingAmount > 0);
    setNotes(sale.notes || "");
    setCreateCourierEntry(sale.hasCourierEntries ?? true);
    if (sale.items && sale.items.length > 0) {
      setItems(
        sale.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          quantity: i.quantity,
          sellingPrice: i.sellingPrice,
          productName: i.Product?.name || i.productName,
          notes: i.notes || undefined,
          isQuickProduct: i.Product?.isMasterProduct === false && i.Product?.name !== "Other",
          _key: `existing-${i.id}`,
        }))
      );
      setOriginalItemsById(
        Object.fromEntries(
          sale.items
            .filter((i) => i.id != null)
            .map((i) => [i.id as number, { quantity: Number(i.quantity), sellingPrice: Number(i.sellingPrice), notes: i.notes || undefined }])
        )
      );
    } else {
      setItems([]);
      setOriginalItemsById({});
    }
    setIsModalOpen(true);
  };

  // Edit button handler for a list row — the row itself (from the Sells list query) doesn't
  // carry payment history, so the full sale is fetched first (same as the Leads deep-link below)
  // and only then handed to openEditModal, guaranteeing existingPayments is always populated.
  const handleEditClick = async (sell: SaleData) => {
    if (!sell.id) return;
    setLoadingEditSaleId(sell.id);
    try {
      const res = await saleService.getSaleById(sell.id);
      const fullSale = res.data?.data || sell;
      openEditModal(fullSale);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Could not load the sale for editing");
    } finally {
      setLoadingEditSaleId(null);
    }
  };

  // Deep-link from the Leads page: a lead auto-creates its own Sell once marked Complete (see
  // backend lead.controller.js#ensureSaleForLead), and Leads.tsx sends the user here via
  // ?openSaleId=<id> so they can review/finish it in the same Edit modal used everywhere else.
  useEffect(() => {
    const openSaleId = searchParams.get("openSaleId");
    if (!openSaleId) return;

    saleService
      .getSaleById(Number(openSaleId))
      .then((res) => {
        const sale = res.data?.data;
        if (sale) openEditModal(sale);
      })
      .catch(() => {
        toast.error("Could not open the linked Sell");
      })
      .finally(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("openSaleId");
            return next;
          },
          { replace: true }
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const closeDetailModal = () => {
    setIsDetailOpen(false);
    setSelectedSale(null);
    setDetailPaymentRows([]);
  };

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      { productId: "", quantity: 1, sellingPrice: "", _key: nextFormItemKey() },
    ]);
  };

  // Removing a row is always allowed while composing the sale, including down to zero rows —
  // "at least one product item" is only enforced at final submit time (see handleSubmit).
  const handleRemoveItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Adds a Quick Add Product line — the modal already created a real, non-master
  // (isMasterProduct: false) Product row backing it. The row is added immediately with
  // isQuickProduct: true and its entered name, so the Product field can show that name as a
  // plain value right away instead of waiting on (or depending on) the active-catalog products
  // query to refetch and include the brand-new row.
  const handleQuickAddProduct = (result: QuickAddProductResult) => {
    setItems((prev) => {
      const quickRow: FormItem = {
        productId: result.productId,
        quantity: result.quantity,
        sellingPrice: result.price,
        productName: result.name,
        notes: result.notes,
        isQuickProduct: true,
        _key: nextFormItemKey(),
      };
      // A leftover untouched row (e.g. one added via "+ Add Product" but never given a product)
      // isn't a real line — replace it instead of appending after it, otherwise it stays behind
      // as an invalid "select a product" row even though the sale now has a valid Quick Product.
      if (prev.every(isEmptyProductRow)) return [quickRow];
      return [...prev, quickRow];
    });
    setIsQuickAddOpen(false);
    // Keeps productsList in sync (e.g. for the stock-shortage pre-check's productType lookup on
    // this same item, and so the picker can resolve it if referenced elsewhere) — not awaited
    // since nothing in the UI depends on this finishing.
    queryClient.invalidateQueries({ queryKey: ["products", "active-catalog"] });
  };

  const handleItemChange = (
    index: number,
    field: keyof FormItem,
    value: any
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleProductSelect = (index: number, productId: number | "") => {
    const selectedProduct = productId === "" ? null : productsList.find((p) => p.id === Number(productId)) || null;

    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        productId: productId === "" ? "" : Number(productId),
        sellingPrice: selectedProduct?.sellingPrice != null ? Number(selectedProduct.sellingPrice) : "",
        quantity: copy[index].quantity || 1,
      };
      return copy;
    });
  };

  const handleQuantityChange = (index: number, quantity: number | "") => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }

    if (courierName === COURIER_COMPANY_OTHER && !otherCourierName.trim()) {
      toast.error("Please enter the courier company name");
      return;
    }

    if (platform === PLATFORM_OTHER && !otherPlatformName.trim()) {
      toast.error("Please enter the platform name");
      return;
    }

    if (courierCharge.trim() !== "" && Number(courierCharge) < 0) {
      toast.error("Courier charge cannot be negative");
      return;
    }

    // "At least one product" is only enforced here at final submit — the user is free to delete
    // rows down to zero while still composing the sale (see handleRemoveItemRow).
    if (items.length === 0) {
      toast.error("At least one product item is required");
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId) {
        toast.error(`Please select a product for row #${i + 1}`);
        return;
      }
      if (!item.quantity || Number(item.quantity) < 1) {
        toast.error(`Quantity for row #${i + 1} must be at least 1`);
        return;
      }
    }

    // Overpaying the order total (Total Selling Amount + Courier Charge) is allowed by design —
    // validatePaymentRows only rejects a genuinely invalid row (missing/zero amount, missing bank
    // account), never a total that's "too high". New rows may go negative on an existing sale to
    // correct an over-collection.
    const validatedPayments = validatePaymentRows(paymentRows, { allowNegative: !!selectedSale });
    if (validatedPayments === null) return;

    if (selectedSale?.id) {
      const saleId = selectedSale.id;

      // Persist product line changes first — new rows (no `id`) via addSaleItem, edited
      // existing rows via updateSaleItem — before the header update below, since Total Selling
      // Amount is derived from the (already locally-updated) items total.
      try {
        for (let idx = 0; idx < items.length; idx++) {
          const row = items[idx];
          if (!row.productId || !row.quantity) continue;
          if (!row.id) {
            const res = await addSaleItemMutation.mutateAsync({
              saleId,
              data: {
                productId: Number(row.productId),
                quantity: Number(row.quantity),
                sellingPrice: Number(row.sellingPrice) || 0,
                notes: row.notes?.trim() || undefined,
              },
            });
            // Tag the row with its new SaleItem id so that if the header update below fails
            // and the user resubmits, this row is treated as existing instead of being
            // added a second time.
            const newId = res.data?.data?.id;
            if (newId) {
              const savedIndex = idx;
              setItems((prev) => prev.map((r, i) => (i === savedIndex ? { ...r, id: newId } : r)));
            }
            continue;
          }

          const original = originalItemsById[row.id];
          const newQuantity = Number(row.quantity);
          const newPrice = Number(row.sellingPrice) || 0;
          const newNotes = row.notes?.trim() || "";
          const quantityChanged = original && newQuantity !== original.quantity;
          const priceChanged = original && newPrice !== original.sellingPrice;
          const notesChanged = original && newNotes !== (original.notes || "");
          if (quantityChanged || priceChanged || notesChanged) {
            await updateSaleItemMutation.mutateAsync({
              saleId,
              itemId: row.id,
              data: {
                quantity: quantityChanged ? newQuantity : undefined,
                sellingPrice: priceChanged ? newPrice : undefined,
                notes: notesChanged ? newNotes : undefined,
              },
            });
            const savedId = row.id;
            setOriginalItemsById((prev) => ({ ...prev, [savedId]: { quantity: newQuantity, sellingPrice: newPrice, notes: newNotes || undefined } }));
          }
        }
      } catch (err: any) {
        toast.error(err.response?.data?.message || err.message || "Failed to update product items");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });

      // Update existing sale
      updateSaleMutation.mutate({
        id: saleId,
        data: {
          customerId: customerId || undefined,
          customerName: customerName.trim(),
          customerNumber: customerNumber || undefined,
          platform: resolvedPlatform,
          to: to || "Madhuram Motor",
          courierName: resolvedCourierName || undefined,
          courierCharge: Number(courierCharge) || 0,
          payments: validatedPayments,
          city: city || undefined,
          fromAddress: fromAddress || undefined,
          pincode: pincode || undefined,
          sellingAmount: effectiveSellingAmount,
          notes: notes || undefined,
          saleDate,
          createCourierEntry,
        },
      });
      return;
    }

    // Create new sale — check stock before submitting so a shortage can be resolved explicitly
    // instead of silently backordering. Skipped for SOFTWARE (no stock concept at all) and
    // HARDWARE_ORDER_BASED (permanently-until-procured "shortage" is the expected steady state
    // for this type, not an error to interrupt the sale for).
    const shortages: StockShortageItem[] = [];
    items.forEach((item) => {
      // Quick Add Product lines are always HARDWARE_ORDER_BASED — checked directly off the row
      // instead of a productsList lookup, which may not have refetched to include a
      // just-created quick product yet.
      if (item.isQuickProduct) return;
      const prod = productsList.find((p) => p.id === Number(item.productId));
      if (prod && (prod.productType === "SOFTWARE" || prod.productType === "HARDWARE_ORDER_BASED")) return;
      const available = prod?.available ?? 0;
      const requested = Number(item.quantity) || 0;
      if (available < requested) {
        shortages.push({ productName: prod?.name || "Selected product", requested, available });
      }
    });

    if (shortages.length > 0) {
      setStockShortagePrompt({ shortages, snapshotItems: items });
      return;
    }

    createSaleMutation.mutate(buildCreatePayload(items));
  };

  // Builds the create-sale payload from a given items list — shared by the direct (no-shortage)
  // submit path and both StockShortageModal resolution paths below.
  const buildCreatePayload = (forItems: FormItem[]): CreateSalePayload => {
    const payloadItems = forItems.map((i) => ({
      productId: Number(i.productId),
      quantity: Number(i.quantity),
      sellingPrice: Number(i.sellingPrice) || 0,
      notes: i.notes?.trim() || undefined,
    }));
    const itemsTotal = forItems.reduce(
      (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0),
      0
    );
    const sellingAmountForItems = sellingAmountManuallyEdited ? Number(manualSellingAmount) || 0 : itemsTotal;

    // Rows were already validated in handleSubmit before this is called (including via the
    // stock-shortage resolution paths, which run after it) — just convert them to the wire shape.
    const paymentsPayload = toPaymentEntries(paymentRows);

    return {
      customerId: customerId || undefined,
      customerName: customerName.trim(),
      customerNumber: customerNumber || undefined,
      platform: resolvedPlatform,
      to: to || "Madhuram Motor",
      courierName: resolvedCourierName || undefined,
      courierCharge: Number(courierCharge) || 0,
      payments: paymentsPayload,
      city: city || undefined,
      fromAddress: fromAddress || undefined,
      pincode: pincode || undefined,
      sellingAmount: sellingAmountForItems,
      collectedAmount: paymentRowsTotal,
      notes: notes || undefined,
      saleDate,
      createCourierEntry,
      items: payloadItems,
    };
  };

  const handleStockShortageAvailableOnly = () => {
    if (!stockShortagePrompt) return;
    const adjusted = stockShortagePrompt.snapshotItems
      .map((item) => {
        const prod = productsList.find((p) => p.id === Number(item.productId));
        // SOFTWARE/HARDWARE_ORDER_BASED were never counted as a "shortage" in the first place
        // (see handleSubmit) — leave their requested quantity untouched here too, rather than
        // trimming them to 0 just because some other line in the same sale was short.
        if (prod && (prod.productType === "SOFTWARE" || prod.productType === "HARDWARE_ORDER_BASED")) return item;
        const available = prod?.available ?? 0;
        const requested = Number(item.quantity) || 0;
        return { ...item, quantity: Math.min(requested, available) };
      })
      .filter((item) => Number(item.quantity) > 0);

    if (adjusted.length === 0) {
      toast.error("None of the selected products currently have stock available");
      return;
    }

    setItems(adjusted);
    createSaleMutation.mutate(buildCreatePayload(adjusted));
    setStockShortagePrompt(null);
  };

  const handleStockShortageAllProducts = () => {
    if (!stockShortagePrompt) return;
    createSaleMutation.mutate(buildCreatePayload(stockShortagePrompt.snapshotItems));
    setStockShortagePrompt(null);
  };

  const handleDelete = (id: number) => {
    setCancelSaleId(id);
  };

  const handleExport = async (format: "pdf" | "excel") => {
    try {
      const res = await saleService.exportSales(format, appliedFilters);
      const blob = new Blob([res.data], {
        type:
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sells-export-${Date.now()}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Export failed");
    }
  };

  // Helper: Fulfillment / Stock indicator badge — reads the backend's real
  // allocated/fulfilled/backordered counters, not the removed shortage fields.
  const renderItemStockIndicator = (item: SaleItemData) => {
    const status = item.fulfillmentStatus;
    const backordered = item.backorderedQuantity || 0;
    const fulfilled = item.fulfilledQuantity || 0;

    if (status === "CANCELLED") {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
          <XCircle className="h-3 w-3" /> Cancelled
        </span>
      );
    }
    if (status === "FULFILLED") {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
          <CheckCircle2 className="h-2.5 w-2.5" /> Fulfilled
        </span>
      );
    }
    if (status === "PARTIALLY_FULFILLED") {
      return (
        <span
          className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800"
          title={`${fulfilled} of ${item.quantity} shipped`}
        >
          <AlertTriangle className="h-3 w-3" /> Shipped {fulfilled}/{item.quantity}
        </span>
      );
    }
    if (backordered > 0) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700"
          title={`${backordered} unit(s) awaiting stock`}
        >
          <AlertTriangle className="h-3 w-3 text-red-600" /> Backordered: {backordered}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        <CheckCircle2 className="h-2.5 w-2.5" /> In Stock
      </span>
    );
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      {/* Top Summary Cards Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-linear-to-br from-blue-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              {canViewAllSales ? "Total Sells" : "My Total Sells"}
            </span>
            <div className="rounded-xl bg-blue-100 p-2 text-blue-600">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            ₹{totalsData.totalSellingAmount.toLocaleString("en-IN")}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {canViewAllSales ? "Combined team selling total" : "Your total sales contribution"}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-linear-to-br from-emerald-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Collected Amount
            </span>
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono">
            ₹{totalsData.totalCollectedAmount.toLocaleString("en-IN")}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Total payments received</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Pending Amount
            </span>
            <div className="rounded-xl bg-amber-100 p-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 font-mono">
            ₹{totalsData.totalPendingAmount.toLocaleString("en-IN")}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Outstanding balance</p>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-linear-to-br from-indigo-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Total Orders
            </span>
            <div className="rounded-xl bg-indigo-100 p-2 text-indigo-600">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            {totalsData.totalSalesCount}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Recorded transactions</p>
        </div>
      </div>

      {/* Filter Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik initialValues={{ search: "", startDate: "", endDate: "", status: initialStatus }} onSubmit={() => { }}>
          {({ resetForm }) => (
            <Form className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <FilterSync setAppliedFilters={setAppliedFilters} />

              <div className="relative ">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search by customer..."
                  className="rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

              <Field
                as="select"
                name="status"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                {ORDER_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Field>

              {canViewAllSales && (
                <select
                  value={appliedFilters.userId || ""}
                  onChange={(e) =>
                    setAppliedFilters((prev) => ({
                      ...prev,
                      userId: e.target.value || undefined,
                      page: 1,
                    }))
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="">All Team Members</option>
                  <option value="2">Parth</option>
                  <option value="4">Vraj</option>
                  <option value="3">Darshil</option>
                </select>
              )}

              <Field
                name="startDate"
                type="date"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />
              <Field
                name="endDate"
                type="date"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setAppliedFilters({});
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2 sm:ml-auto">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsExportOpen((o) => !o)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {isExportOpen && (
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          handleExport("pdf");
                          setIsExportOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Export as PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleExport("excel");
                          setIsExportOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Export as Excel
                      </button>
                    </div>
                  )}
                </div>

                {pagePermission.canCreate && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#3162d2] active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" />
                    Add Sale
                  </button>
                )}
              </div>
            </Form>
          )}
        </Formik>
      </div>

      {/* Table Section */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isSellsLoading ? (
          <div className="flex min-h-75 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
              <span className="text-xs text-slate-500 font-medium">
                Loading sells records...
              </span>
            </div>
          </div>
        ) : sellsError ? (
          <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-semibold text-rose-500">
              Failed to load sells list
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {(sellsError as any).message || "An unexpected error occurred"}
            </p>
          </div>
        ) : !pagePermission.canRead ? (
          <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-medium text-slate-500">
              You do not have permission to view sells records.
            </p>
          </div>
        ) : sellsList.length === 0 ? (
          <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
            <div className="rounded-full bg-slate-100 p-4 text-slate-400">
              <ShoppingBag className="h-8 w-8 stroke-[1.5]" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">
              No sells Entries Found
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Click the "Add sells Entry" button above to record your first transaction.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Sr No.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Invoice #</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Products</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Platform</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Payment</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">City</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">From</th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">
                    Selling (₹)
                  </th>
                  {/* <th className="px-4 py-3.5 whitespace-nowrap">Status</th> */}
                  <th className="px-4 py-3.5 whitespace-nowrap">Date</th>
                  {/* {isAdmin && ( */}
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">
                    Actions
                  </th>
                  {/* )} */}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sellsList.map((sell, index) => (
                  <tr
                    key={sell.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-mono text-slate-400">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-semibold text-blue-600">
                      {sell.invoiceNumber || `SELL-#${sell.id}`}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900">
                        {sell.customerName}
                      </div>
                      {sell.customerNumber && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {sell.customerNumber}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      {sell.items && sell.items.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {sell.items.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-1.5 flex-wrap"
                            >
                              <span className="font-medium text-slate-800">
                                {item.Product?.name ||
                                  item.productName ||
                                  `Product #${item.productId}`}
                              </span>
                              <span className="rounded bg-slate-100 px-1 py-0.2 text-[10px] font-bold text-slate-700">
                                ×{item.quantity}
                              </span>
                              {renderItemStockIndicator(item)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {sell.platform || "Direct"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">
                        {sell.paymentMethod || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {sell.city ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-100">
                          {sell.city}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {sell.to || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                      ₹{Number(sell.sellingAmount || 0).toLocaleString("en-IN")}
                    </td>
                    {/* <td className="px-4 py-3.5 whitespace-nowrap">
                      {renderStatusBadge(sell.status)}
                    </td> */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-[11px] text-slate-500">
                      {sell.saleDate || sell.createdAt
                        ? formatDisplayDate(sell.saleDate || sell.createdAt)
                        : "—"}
                    </td>
                    {/* {isAdmin && ( */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex justify-end items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedSale(sell);
                              setIsDetailOpen(true);
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {pagePermission.canUpdate && (
                            <button
                              onClick={() => handleEditClick(sell)}
                              disabled={loadingEditSaleId === sell.id}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50 transition disabled:opacity-50"
                              title="Edit"
                            >
                              {loadingEditSaleId === sell.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Edit2 className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          {pagePermission.canDelete && (
                            <button
                              onClick={() => sell.id && handleDelete(sell.id)}
                              className="rounded p-1 text-rose-500 hover:bg-rose-50 transition"
                              title="Cancel Sale"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    {/* )} */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isSellsLoading && !sellsError && pagePermission.canRead && sellsList.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              Page {paginationMeta.page} of {paginationMeta.totalPages} · {paginationMeta.total} records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={paginationMeta.page <= 1}
                onClick={() =>
                  setAppliedFilters((prev) => ({ ...prev, page: Math.max(1, paginationMeta.page - 1) }))
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={paginationMeta.page >= paginationMeta.totalPages}
                onClick={() =>
                  setAppliedFilters((prev) => ({
                    ...prev,
                    page: Math.min(paginationMeta.totalPages, paginationMeta.page + 1),
                  }))
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT SALE MODAL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedSale ? "Edit Sells Entry" : "New Sells Entry"}
                </h3>
                <p className="text-xs text-slate-500">
                  Fill in customer and product line items. Stock will update automatically.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-6">
              {/* Section 1: Customer Info */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  1. Customer Details
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Customer Mobile / Phone *
                      </label>
                      {customerLookupStatus === "loading" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-medium animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                        </span>
                      )}
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      autoComplete="off"
                      value={customerNumber}
                      onChange={(e) => {
                        const numericOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setCustomerNumber(numericOnly);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => {
                        if (customerSuggestions.length > 0) setShowSuggestions(true);
                      }}
                      placeholder="e.g. 9876543210 (10 digits)"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />

                    {/* Autocomplete Suggestions Dropdown */}
                    {showSuggestions && customerSuggestions.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          Matching Customers ({customerSuggestions.length})
                        </div>
                        {customerSuggestions.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => handleSelectCustomer(cust)}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{cust.name}</p>
                              <p className="text-[11px] text-blue-600 font-mono">{cust.phone}</p>
                            </div>
                            {cust.city && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {cust.city}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {customerLookupStatus === "found" && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Customer found: {foundCustomerInfo}
                      </p>
                    )}
                    {customerLookupStatus === "not_found" && customerNumber.trim().length >= 10 && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                        <UserCheck className="h-3.5 w-3.5" /> New customer (will be auto-saved)
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Parth Patel"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Rajkot"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      From Address / Source
                    </label>
                    <input
                      type="text"
                      value={fromAddress}
                      onChange={(e) => setFromAddress(e.target.value)}
                      placeholder="Source warehouse / pickup address"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pincode
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => {
                        const numericOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setPincode(numericOnly);
                      }}
                      placeholder="e.g. 360001"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Order Info */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  2. Order Parameters
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={saleDate}
                      onChange={(e) => setSaleDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sells Platform
                    </label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    >
                      {PLATFORM_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {platform === PLATFORM_OTHER && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Custom Platform Name
                      </label>
                      <input
                        type="text"
                        value={otherPlatformName}
                        onChange={(e) => setOtherPlatformName(e.target.value)}
                        placeholder="e.g. Facebook Marketplace"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      From
                    </label>
                    <input
                      type="text"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="Madhuram Motor"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Courier <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <select
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    >
                      {COURIER_COMPANY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {courierName === COURIER_COMPANY_OTHER && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Custom Courier Company Name
                      </label>
                      <input
                        type="text"
                        value={otherCourierName}
                        onChange={(e) => setOtherCourierName(e.target.value)}
                        placeholder="e.g. Local Courier Service"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}

                </div>

              </div>

              {/* Section 3: Products Multi-Row Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-blue-600" />
                    3. Products Included ({items.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsQuickAddOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <PackagePlus className="h-3 w-3" /> Quick add product
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="inline-flex items-center gap-1 rounded-md bg-[#3d6fe0] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#3162d2]"
                    >
                      <Plus className="h-3 w-3" /> Add Product
                    </button>
                  </div>
                </div>
                {selectedSale && (
                  <p className="mb-3 text-[10px] text-slate-400">
                    Quantity and price can be edited, and new products added, at any time. An existing line's product can't be swapped — remove it isn't available either; cancel the affected item instead if it was added in error.
                  </p>
                )}

                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
                    No products added yet.
                  </p>
                )}

                <div className="space-y-3">
                  {items.map((row, index) => {
                    const selectedProd = productsList.find(
                      (p) => p.id === Number(row.productId)
                    );
                    // A Quick Add Product line — a real, non-master Product row created just for
                    // this sale (see QuickAddProductModal). Checked off the row's own explicit
                    // flag first (always correct immediately after adding it, regardless of
                    // whether the active-catalog products query has refetched yet); falls back to
                    // a productsList lookup for rows hydrated from an existing sale that predate
                    // this flag. Distinct from the pinned "Other" placeholder, also isMasterProduct: false.
                    const isQuickProduct =
                      row.isQuickProduct === true ||
                      (!!selectedProd && selectedProd.isMasterProduct === false && selectedProd.name !== "Other");
                    const isNotStockTracked = isQuickProduct || selectedProd?.productType === "SOFTWARE" || selectedProd?.productType === "HARDWARE_ORDER_BASED";
                    const stockQty = selectedProd ? (selectedProd.available ?? 0) : 0;
                    const isShort =
                      !isNotStockTracked &&
                      row.productId &&
                      stockQty < (Number(row.quantity) || 1);

                    return (
                      <div
                        key={row._key}
                        className="flex flex-col gap-2.5 rounded-lg bg-white p-3 border border-slate-200 shadow-sm"
                      >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-slate-400 w-5">
                          #{index + 1}
                        </span>

                        {/* Product field — a Quick Add Product line has a fixed, manually-entered
                            name (not a catalog selection), so it's shown as plain text instead of
                            the searchable picker: no dropdown/suggestions, and no dependency on
                            the active-catalog products list containing this just-created row. */}
                        <div className="flex-1 w-full sm:w-auto">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Product *
                          </label>
                          {isQuickProduct ? (
                            <input
                              type="text"
                              readOnly
                              disabled
                              value={row.productName || ""}
                              title="Quick-added product — the name is fixed and can't be changed here"
                              className="w-full rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                            />
                          ) : (
                            <ProductSearchSelect
                              products={productsListForPicker}
                              value={row.productId}
                              onChange={(productId) => handleProductSelect(index, productId)}
                              disabled={!!row.id}
                              isLoading={isProductsLoading}
                              fallbackLabel={row.productName}
                              title={row.id ? "An existing line's product can't be changed — add a new product row instead" : undefined}
                            />
                          )}
                        </div>

                        {/* Quick Product indicator */}
                        {isQuickProduct && (
                          <div className="sm:pt-4">
                            <span className="rounded bg-indigo-50 border border-indigo-200 px-2 py-1 text-[10px] font-bold text-indigo-700 whitespace-nowrap">
                              Quick Product
                            </span>
                          </div>
                        )}

                        {/* Stock indicator badge */}
                        {row.productId && (
                          <div className="sm:pt-4">
                            {selectedProd?.productType === "SOFTWARE" ? (
                              <span className="rounded bg-purple-50 border border-purple-200 px-2 py-1 text-[10px] font-bold text-purple-700 whitespace-nowrap">
                                No stock tracking
                              </span>
                            ) : isQuickProduct || selectedProd?.productType === "HARDWARE_ORDER_BASED" ? (
                              <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-700 whitespace-nowrap">
                                Arranged per sale
                              </span>
                            ) : stockQty <= 0 ? (
                              <span className="rounded bg-red-50 border border-red-200 px-2 py-1 text-[10px] font-bold text-red-700 whitespace-nowrap">
                                Stock: 0 (Out of Stock / -1)
                              </span>
                            ) : isShort ? (
                              <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-700 whitespace-nowrap">
                                Stock: {stockQty} (Shortage:{" "}
                                {Number(row.quantity) - stockQty})
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                                Stock: {stockQty}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Quantity */}
                        <div className="w-24">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Qty *
                          </label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={row.quantity}
                            onChange={(e) =>
                              handleQuantityChange(
                                index,
                                e.target.value ? Number(e.target.value) : ""
                              )
                            }
                            onWheel={blurNumberInputOnWheel}
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>

                        {/* Selling Price per unit */}
                        <div className="w-28">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Price / Unit (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.sellingPrice}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "sellingPrice",
                                e.target.value ? Number(e.target.value) : ""
                              )
                            }
                            onWheel={blurNumberInputOnWheel}
                            placeholder="0.00"
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>

                        {/* Row Subtotal */}
                        <div className="w-24 sm:pt-4 text-right">
                          <span className="text-xs font-bold text-slate-800">
                            ₹
                            {(
                              (Number(row.quantity) || 0) *
                              (Number(row.sellingPrice) || 0)
                            ).toLocaleString("en-IN")}
                          </span>
                        </div>

                        {/* Remove Row Button — only for a row not yet saved as a SaleItem;
                            an existing line is removed via the dedicated Cancel Item flow instead. */}
                        {!row.id && (
                          <div className="sm:pt-4">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(index)}
                              className="rounded p-1 text-slate-400 hover:text-rose-600 transition"
                              title="Remove Row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Notes — Quick Add Product lines only */}
                      {isQuickProduct && (
                        <div className="pl-7">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Notes
                          </label>
                          <input
                            type="text"
                            value={row.notes || ""}
                            onChange={(e) => handleItemChange(index, "notes", e.target.value)}
                            placeholder="Optional note about this item"
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                          />
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 4: Amounts & Calculations */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <IndianRupee className="h-4 w-4 text-emerald-600" />
                  4. Payment & Amount Calculations
                </h4>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Total Selling Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualSellingAmount}
                      onFocus={(e) => {
                        // Typing into the default "0" appends after it (e.g. "0" + "5" = "05")
                        // instead of replacing it — clear it on focus so the first keystroke starts fresh.
                        if (e.target.value === "0") setManualSellingAmount("");
                      }}
                      onBlur={() => {
                        // Clearing the field hands control back to the live items total instead
                        // of getting stuck on a blank/invalid value.
                        if (manualSellingAmount.trim() === "") {
                          setManualSellingAmount(String(calculatedItemsTotal));
                          setSellingAmountManuallyEdited(false);
                        }
                      }}
                      onChange={(e) => {
                        setManualSellingAmount(e.target.value);
                        setSellingAmountManuallyEdited(true);
                      }}
                      onWheel={blurNumberInputOnWheel}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                    />
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Calculated from items: ₹
                      {calculatedItemsTotal.toLocaleString("en-IN")}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Courier Charge (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={courierCharge}
                      onFocus={(e) => {
                        // Typing into the default "0" appends after it (e.g. "0" + "5" = "05")
                        // instead of replacing it — clear it on focus so the first keystroke starts fresh.
                        if (e.target.value === "0") setCourierCharge("");
                      }}
                      onBlur={() => {
                        if (courierCharge.trim() === "") setCourierCharge("0");
                      }}
                      onChange={(e) => setCourierCharge(e.target.value)}
                      onWheel={blurNumberInputOnWheel}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                    />
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Optional shipping/courier charge for this sale — 0 if none.
                    </p>
                  </div>
                </div>

                {selectedSale && existingPayments.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Existing Payments
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                      {existingPayments.map((p) => {
                        const isEditing = editingPaymentId === p.id;
                        const isConfirmingDelete = deletePaymentConfirmId === p.id;
                        return (
                          <div key={p.id} className="p-2.5">
                            {isEditing ? (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <select
                                  value={editPaymentDraft.method}
                                  onChange={(e) =>
                                    setEditPaymentDraft((prev) => ({ ...prev, method: e.target.value as PaymentEntryMethod }))
                                  }
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:border-[#3d6fe0] focus:outline-none"
                                >
                                  {PAYMENT_ENTRY_METHODS.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editPaymentDraft.amount}
                                  onChange={(e) => setEditPaymentDraft((prev) => ({ ...prev, amount: e.target.value }))}
                                  onWheel={blurNumberInputOnWheel}
                                  placeholder="Amount"
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:border-[#3d6fe0] focus:outline-none"
                                />
                                {needsBankAccount(editPaymentDraft.method) ? (
                                  <select
                                    value={editPaymentDraft.bankAccountId}
                                    onChange={(e) =>
                                      setEditPaymentDraft((prev) => ({
                                        ...prev,
                                        bankAccountId: e.target.value ? Number(e.target.value) : "",
                                      }))
                                    }
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:border-[#3d6fe0] focus:outline-none"
                                  >
                                    <option value="">Select bank account</option>
                                    {bankAccountsList
                                      .filter((b): b is typeof b & { id: number } => b.id != null)
                                      .map((b) => (
                                        <option key={b.id} value={b.id}>
                                          {b.bankName} — {b.accountNumber}
                                        </option>
                                      ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={editPaymentDraft.transactionRef}
                                    onChange={(e) => setEditPaymentDraft((prev) => ({ ...prev, transactionRef: e.target.value }))}
                                    placeholder="Ref/Txn #"
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:border-[#3d6fe0] focus:outline-none"
                                  />
                                )}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={updatePaymentMutation.isPending}
                                    onClick={() => {
                                      if (!selectedSale?.id || !p.id) return;
                                      const amount = Number(editPaymentDraft.amount);
                                      if (!editPaymentDraft.amount.trim() || isNaN(amount) || amount <= 0) {
                                        toast.error("Amount must be greater than 0");
                                        return;
                                      }
                                      if (needsBankAccount(editPaymentDraft.method) && !editPaymentDraft.bankAccountId) {
                                        toast.error(`Select a bank account for the ${editPaymentDraft.method} payment`);
                                        return;
                                      }
                                      updatePaymentMutation.mutate({
                                        saleId: selectedSale.id,
                                        paymentId: p.id,
                                        data: {
                                          amount,
                                          method: editPaymentDraft.method,
                                          bankAccountId: needsBankAccount(editPaymentDraft.method)
                                            ? Number(editPaymentDraft.bankAccountId) || null
                                            : null,
                                          transactionRef: editPaymentDraft.transactionRef.trim() || null,
                                        },
                                      });
                                    }}
                                    className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    {updatePaymentMutation.isPending ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPaymentId(null)}
                                    className="rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[11px]">
                                  <span className="font-bold text-slate-800">{p.method || "—"}</span>
                                  {(p.method === "BankTransfer" || p.method === "UPI") && p.bankAccount && (
                                    <span className="ml-1.5 text-slate-400">
                                      {p.bankAccount.bankName} — {p.bankAccount.accountNumber}
                                    </span>
                                  )}
                                  {p.transactionRef && <span className="ml-1.5 text-slate-400">Ref: {p.transactionRef}</span>}
                                  {p.createdAt && <span className="ml-1.5 text-slate-300">{formatDisplayDate(p.createdAt)}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-bold ${Number(p.amount) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                    {Number(p.amount) < 0 ? "-" : ""}₹{Math.abs(Number(p.amount)).toLocaleString("en-IN")}
                                  </span>
                                  {isConfirmingDelete ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-slate-500">Delete?</span>
                                      <button
                                        type="button"
                                        disabled={deletePaymentMutation.isPending}
                                        onClick={() => {
                                          if (!selectedSale?.id || !p.id) return;
                                          deletePaymentMutation.mutate({ saleId: selectedSale.id, paymentId: p.id });
                                        }}
                                        className="rounded p-1 text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                                        title="Confirm delete"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeletePaymentConfirmId(null)}
                                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                        title="Cancel"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!p.id) return;
                                          setEditingPaymentId(p.id);
                                          setEditPaymentDraft({
                                            method: (p.method as PaymentEntryMethod) || "Cash",
                                            amount: String(p.amount ?? ""),
                                            bankAccountId: p.bankAccountId || "",
                                            transactionRef: p.transactionRef || "",
                                          });
                                        }}
                                        className="rounded p-1 text-blue-600 hover:bg-blue-50"
                                        title="Edit payment"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeletePaymentConfirmId(p.id ?? null)}
                                        className="rounded p-1 text-rose-600 hover:bg-rose-50"
                                        title="Delete payment"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method{" "}
                    <span className="font-normal text-slate-400">
                      {selectedSale ? "(add new payment(s) collected now)" : "(how the customer is paying — split across methods if needed)"}
                    </span>
                  </label>
                  {selectedSale && (
                    <p className="mb-2 text-[10px] text-slate-400">
                      Already collected: ₹{Number(selectedSale.collectedAmount ?? 0).toLocaleString("en-IN")}. Rows below
                      are added as new payment(s) on top of that — enter a negative amount to correct an
                      over-collection instead.
                    </p>
                  )}
                  <PaymentsEditor
                    rows={paymentRows}
                    onChange={setPaymentRows}
                    bankAccounts={bankAccountsList}
                    allowNegative={!!selectedSale}
                    addLabel="Add Payment"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-5">
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Order Total</span>
                    <span className="text-sm font-bold text-slate-900">₹{effectiveOrderTotal.toLocaleString("en-IN")}</span>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      ₹{effectiveSellingAmount.toLocaleString("en-IN")} selling + ₹{effectiveCourierCharge.toLocaleString("en-IN")} courier
                    </p>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Total Paid</span>
                    <span className="text-sm font-bold text-emerald-600">₹{effectiveCollectedAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Remaining</span>
                    <span className={`text-sm font-bold ${pendingAmount > 0 ? "text-rose-600" : "text-slate-500"}`}>
                      ₹{pendingAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                  {overpaidAmount > 0 && (
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Overpaid</span>
                      <span className="text-sm font-bold text-amber-600">₹{overpaidAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Status</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        pendingAmount <= 0 && effectiveCollectedAmount > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : effectiveCollectedAmount > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {pendingAmount <= 0 && effectiveCollectedAmount > 0
                        ? overpaidAmount > 0
                          ? "Paid (Overpaid)"
                          : "Paid"
                        : effectiveCollectedAmount > 0
                          ? "Partially Paid"
                          : "Unpaid"}
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes / Remarks
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Any special remarks or delivery instructions..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none resize-none"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    id="createCourierEntry"
                    type="checkbox"
                    checked={createCourierEntry}
                    disabled={isCourierEntryLocked}
                    onChange={(e) => setCreateCourierEntry(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#3d6fe0] focus:ring-[#3d6fe0] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <label htmlFor="createCourierEntry" className="text-xs font-semibold text-slate-700">
                    Create Courier Entry
                  </label>
                </div>
                {isCourierEntryLocked ? (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Not available for "Other" — there's nothing physical to ship for this sale.
                  </p>
                ) : (
                  selectedSale && (
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Changing this creates or cancels the shipment tracking entries for this sale's items.
                    </p>
                  )
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createSaleMutation.isPending ||
                    updateSaleMutation.isPending ||
                    addSaleItemMutation.isPending ||
                    updateSaleItemMutation.isPending
                  }
                  className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#3162d2] disabled:opacity-50"
                >
                  {createSaleMutation.isPending ||
                  updateSaleMutation.isPending ||
                  addSaleItemMutation.isPending ||
                  updateSaleItemMutation.isPending
                    ? "Processing..."
                    : selectedSale
                      ? "Update sells Entry"
                      : "Create Sells Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* DETAIL MODAL */}
      {isDetailOpen && selectedSale && detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetailModal(); }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-blue-600 uppercase">
                  {detail.invoiceNumber}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Sale Details — {detail.customerName}
                  {isDetailLoading && (
                    <Loader2 className="inline-block h-3.5 w-3.5 ml-2 animate-spin text-slate-400" />
                  )}
                </h3>
              </div>
              <button
                onClick={closeDetailModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Platform
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.platform || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Payment Method
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.paymentMethod || "—"}
                    {(!detail.bankPayments || detail.bankPayments.length === 0) && detail.bankAccount && (
                      <span className="block text-[10px] font-normal text-slate-500">
                        {detail.bankAccount.bankName} — {detail.bankAccount.accountNumber}
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    City
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.city || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Customer Phone
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.customerNumber || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    From Address
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.fromAddress || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Pincode
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.pincode || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    From
                  </span>
                  <span className="font-semibold text-slate-800">
                    {detail.to || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Courier Charge
                  </span>
                  <span className="font-semibold text-slate-800">
                    ₹{Number(detail.courierCharge || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/couriers")}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-2 text-xs font-bold text-white hover:bg-[#3162d2]"
              >
                Manage Line Items, Fulfillment & Courier History in Couriers →
              </button>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 sm:grid-cols-3">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Order Total
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    ₹{(Number(detail.sellingAmount || 0) + Number(detail.courierCharge || 0)).toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Collected Amount
                  </span>
                  <span className="text-sm font-bold text-emerald-600">
                    ₹{Number(detail.collectedAmount).toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Pending Amount
                  </span>
                  <span
                    className={`text-sm font-bold ${Number(detail.pendingAmount) > 0
                      ? "text-rose-600"
                      : "text-slate-600"
                      }`}
                  >
                    ₹{Number(detail.pendingAmount).toLocaleString("en-IN")}
                  </span>
                </div>
                {Number(detail.collectedAmount || 0) > Number(detail.sellingAmount || 0) + Number(detail.courierCharge || 0) && (
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">
                      Overpaid
                    </span>
                    <span className="text-sm font-bold text-amber-600">
                      ₹{(Number(detail.collectedAmount || 0) - Number(detail.sellingAmount || 0) - Number(detail.courierCharge || 0)).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Status
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      detail.paymentStatus === "PAID"
                        ? "bg-emerald-100 text-emerald-700"
                        : detail.paymentStatus === "PARTIALLY_PAID"
                          ? "bg-amber-100 text-amber-700"
                          : detail.paymentStatus === "REFUNDED" || detail.paymentStatus === "PARTIALLY_REFUNDED"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {detail.paymentStatus === "PAID"
                      ? "Paid"
                      : detail.paymentStatus === "PARTIALLY_PAID"
                        ? "Partially Paid"
                        : detail.paymentStatus === "REFUNDED"
                          ? "Refunded"
                          : detail.paymentStatus === "PARTIALLY_REFUNDED"
                            ? "Partially Refunded"
                            : "Unpaid"}
                  </span>
                </div>
              </div>

              {detail.bankPayments && detail.bankPayments.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                    Bank Account Split
                  </h4>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Bank Account</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.bankPayments.map((bp) => (
                          <tr key={bp.id}>
                            <td className="p-2.5 text-slate-600">
                              {bp.bankAccount ? `${bp.bankAccount.bankName} — ${bp.bankAccount.accountNumber}` : "—"}
                            </td>
                            <td className="p-2.5 text-right font-bold text-emerald-600">
                              ₹{Number(bp.amount).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                  Payment History
                </h4>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  {detail.payments && detail.payments.length > 0 ? (
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5">Ref #</th>
                          <th className="p-2.5">Recorded By</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2.5 text-slate-600">
                              {p.createdAt ? formatDisplayDate(p.createdAt) : "—"}
                            </td>
                            <td className="p-2.5 text-slate-600">
                              {p.method || "—"}
                              {(p.method === "BankTransfer" || p.method === "UPI") && p.bankAccount && (
                                <div className="text-[10px] text-slate-400">{p.bankAccount.bankName} — {p.bankAccount.accountNumber}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-600">{p.transactionRef || "—"}</td>
                            <td className="p-2.5 text-slate-600">{p.creator?.name || "—"}</td>
                            <td className={`p-2.5 text-right font-bold ${Number(p.amount) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                              {Number(p.amount) < 0 ? "-" : ""}₹{Math.abs(Number(p.amount)).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-3 text-slate-400">No payments recorded yet.</p>
                  )}
                </div>

                {pagePermission.canUpdate && Number(detail.pendingAmount) > 0 && (
                  <div className="mt-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 p-2.5">
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1.5">
                      Record Payment — remaining ₹{Number(detail.pendingAmount).toLocaleString("en-IN")}
                    </label>
                    <PaymentsEditor
                      rows={detailPaymentRows}
                      onChange={setDetailPaymentRows}
                      bankAccounts={bankAccountsList}
                      addLabel="Add Payment"
                    />
                    {detailPaymentRows.length > 0 && (
                      <button
                        type="button"
                        disabled={recordPaymentsMutation.isPending || !detail.id}
                        onClick={() => {
                          if (!detail.id) return;
                          const validated = validatePaymentRows(detailPaymentRows);
                          if (validated === null) return;
                          if (validated.length === 0) {
                            toast.error("Enter a valid payment amount");
                            return;
                          }
                          recordPaymentsMutation.mutate({ saleId: detail.id, payments: validated });
                        }}
                        className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {recordPaymentsMutation.isPending ? "Recording..." : "Save Payment"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {detail.notes && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  <span className="text-blue-700 font-bold block text-[10px] uppercase">
                    Notes
                  </span>
                  <p className="text-slate-700 mt-0.5">{detail.notes}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={closeDetailModal}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelSaleId !== null && (
        <CancelSaleModal
          onClose={() => setCancelSaleId(null)}
          isSubmitting={deleteSaleMutation.isPending}
          onConfirm={({ defective, reason }) =>
            deleteSaleMutation.mutate({ id: cancelSaleId, defective, reason })
          }
        />
      )}

      {stockShortagePrompt && (
        <StockShortageModal
          shortages={stockShortagePrompt.shortages}
          isSubmitting={createSaleMutation.isPending}
          onClose={() => setStockShortagePrompt(null)}
          onAvailableOnly={handleStockShortageAvailableOnly}
          onAllProducts={handleStockShortageAllProducts}
        />
      )}

      {isQuickAddOpen && (
        <QuickAddProductModal
          onClose={() => setIsQuickAddOpen(false)}
          onAdd={handleQuickAddProduct}
        />
      )}

    </div>
  );
};

export default Sells;
