import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, RotateCcw, Trash2, Eye, Edit2, AlertTriangle, CheckCircle2, XCircle, Package, IndianRupee, ShoppingBag, Search as SearchIcon, Download, ChevronDown, UserCheck, Loader2 } from "lucide-react";
import { Formik, Form, Field, useFormikContext } from "formik";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import saleService, {
  type SaleData,
  type SaleItemData,
  type CreateSalePayload,
  type SalesFilters,
  type SellsTotalsData,
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
import ProductSearchSelect from "@/pages/sells/components/ProductSearchSelect";
import { blurNumberInputOnWheel } from "@/shared/utils/input";
import { formatDisplayDate } from "@/shared/utils/date";

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
}

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "BankTransfer",
  "Other",
] as const;

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CANCELLED", label: "Cancelled" },
];

// The selectable Sales Platform list comes from the backend-managed Platform module (see
// services/platform.service.ts, shared with the Lead form's platform picker). "Other" is always
// appended locally as a special "type your own" option — see resolvedPlatform below — never
// persisted as a Platform row.
const PLATFORM_OTHER = "Other";

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<SalesFilters>>;
}) => {
  const { values } = useFormikContext<{ search: string; startDate: string; endDate: string; status: string }>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
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
    .filter((name) => name.trim().toLowerCase() !== PLATFORM_OTHER.toLowerCase());
  const PLATFORM_OPTIONS = [...dynamicPlatformNames, PLATFORM_OTHER];

  const productsList: ProductData[] = productsResponse?.data?.data || [];
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
  const [paymentMethod, setPaymentMethod] = useState<string>("UPI");
  // Bank Account field — shown every time regardless of Payment Method, optional, and splits
  // the collected amount across bank accounts. Each row is a {bankAccountId, amount} pair; the
  // same bank account can appear in more than one row (rows are never merged).
  const [bankPayments, setBankPayments] = useState<{ bankAccountId: number | ""; amount: string }[]>([]);
  const [city, setCity] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [collectedAmount, setCollectedAmount] = useState<string>("0");
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
  // Checked by default so the existing courier-entry behavior is unchanged unless the user
  // explicitly opts out (e.g. a walk-in sale that isn't shipped). On Edit, this is re-initialized
  // from the sale's actual current state (see openEditModal) instead of always defaulting true.
  const [createCourierEntry, setCreateCourierEntry] = useState(true);

  // Cancel-sale confirmation (with the defective/write-off option) — id of the sale awaiting confirmation.
  const [cancelSaleId, setCancelSaleId] = useState<number | null>(null);
  const [items, setItems] = useState<FormItem[]>([
    { productId: "", quantity: 1, sellingPrice: "" },
  ]);
  // Snapshot of each existing line's quantity/price as loaded into Edit — lets handleSubmit
  // diff against the live `items` state and only send updateSaleItem for lines the user
  // actually changed.
  const [originalItemsById, setOriginalItemsById] = useState<Record<number, { quantity: number; sellingPrice: number }>>({});

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

  const bankPaymentsTotal = useMemo(
    () => bankPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [bankPayments]
  );

  // Once any bank split rows exist, they define the collected amount directly — the field is
  // just a readOnly reflection of their sum instead of independently-tracked state.
  const effectiveCollectedAmount = bankPayments.length > 0 ? bankPaymentsTotal : Number(collectedAmount) || 0;

  const pendingAmount = Math.max(0, effectiveSellingAmount - effectiveCollectedAmount);

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
    mutationFn: ({ id, data }: { id: number; data: Partial<SaleData> }) =>
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
    mutationFn: ({ saleId, data }: { saleId: number; data: { productId: number; quantity: number; sellingPrice: number } }) =>
      saleService.addSaleItem(saleId, data),
  });

  // Mutation: Edit an existing sale line's price and/or quantity (Edit flow only). Same
  // batch-from-handleSubmit pattern as addSaleItemMutation above.
  const updateSaleItemMutation = useMutation({
    mutationFn: ({ saleId, itemId, data }: { saleId: number; itemId: number; data: { quantity?: number; sellingPrice?: number } }) =>
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

  // Payment-history "Record Payment" mini-form state (inside the detail modal)
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>("Cash");
  const [bankAccountIdInput, setBankAccountIdInput] = useState<number | "">("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const recordPaymentMutation = useMutation({
    mutationFn: ({ saleId, amount, method, bankAccountId, notes }: { saleId: number; amount: number; method: string; bankAccountId?: number | null; notes?: string }) =>
      saleService.recordPayment(saleId, { amount, method, bankAccountId, notes }),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["sells-totals"] });
      queryClient.invalidateQueries({ queryKey: ["sale-detail", selectedSale?.id] });
      setPaymentAmount("");
      setBankAccountIdInput("");
      setPaymentNotes("");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to record payment");
    },
  });

  const resetForm = () => {
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
    setPaymentMethod("UPI");
    setBankPayments([]);
    setCity("");
    setFromAddress("");
    setPincode("");
    setCollectedAmount("0");
    setManualSellingAmount("0");
    setSellingAmountManuallyEdited(false);
    setNotes("");
    setCreateCourierEntry(true);
    setItems([{ productId: "", quantity: 1, sellingPrice: "" }]);
    setOriginalItemsById({});
    setSelectedSale(null);
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
    const platformIsOther = !!savedPlatform && !dynamicPlatformNames.includes(savedPlatform);
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
    setPaymentMethod(sale.paymentMethod || "UPI");
    setBankPayments(
      sale.bankPayments && sale.bankPayments.length > 0
        ? sale.bankPayments.map((bp) => ({ bankAccountId: bp.bankAccountId, amount: String(bp.amount) }))
        : sale.bankAccountId
        ? [{ bankAccountId: sale.bankAccountId, amount: String(sale.collectedAmount ?? 0) }]
        : []
    );
    setCity(sale.city || "");
    setFromAddress(sale.fromAddress || "");
    setPincode(sale.pincode || "");
    setCollectedAmount(String(sale.collectedAmount ?? 0));
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
          productName: i.productName,
        }))
      );
      setOriginalItemsById(
        Object.fromEntries(
          sale.items.filter((i) => i.id != null).map((i) => [i.id as number, { quantity: Number(i.quantity), sellingPrice: Number(i.sellingPrice) }])
        )
      );
    } else {
      setItems([{ productId: "", quantity: 1, sellingPrice: "" }]);
      setOriginalItemsById({});
    }
    setIsModalOpen(true);
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
    setPaymentAmount("");
    setPaymentMethodInput("Cash");
    setBankAccountIdInput("");
    setPaymentNotes("");
  };

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      { productId: "", quantity: 1, sellingPrice: "" },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      toast.error("At least one product item is required");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
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

  const handleAddBankPaymentRow = () => {
    setBankPayments((prev) => [...prev, { bankAccountId: "", amount: "" }]);
  };

  const handleRemoveBankPaymentRow = (index: number) => {
    setBankPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBankPaymentChange = (
    index: number,
    field: "bankAccountId" | "amount",
    value: number | "" | string
  ) => {
    setBankPayments((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value } as { bankAccountId: number | ""; amount: string };
      return copy;
    });
  };

  // Validates the bank payment rows against the sale's total paid amount (the live
  // Collected Amount input, editable both while creating and while editing). Returns the
  // sanitized rows to submit, or null (after showing a toast) if invalid.
  const validateBankPayments = (totalPaid: number) => {
    if (paymentMethod === "Cash" || paymentMethod === "Other") return [];

    for (let i = 0; i < bankPayments.length; i++) {
      const row = bankPayments[i];
      if (!row.bankAccountId) {
        toast.error(`Select a bank account for payment row #${i + 1}`);
        return null;
      }
      if (!row.amount || Number(row.amount) <= 0) {
        toast.error(`Enter a valid amount for payment row #${i + 1}`);
        return null;
      }
    }

    const total = bankPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (total > totalPaid + 0.01) {
      toast.error("Bank account payment amounts cannot exceed the total paid amount");
      return null;
    }

    return bankPayments.map((row) => ({ bankAccountId: Number(row.bankAccountId), amount: Number(row.amount) }));
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

    // Bank payment rows split the total paid amount across bank accounts — validated against
    // the live Collected Amount (editable both while creating and while editing).
    const validatedBankPayments = validateBankPayments(effectiveCollectedAmount);
    if (validatedBankPayments === null) return;

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
          const quantityChanged = original && newQuantity !== original.quantity;
          const priceChanged = original && newPrice !== original.sellingPrice;
          if (quantityChanged || priceChanged) {
            await updateSaleItemMutation.mutateAsync({
              saleId,
              itemId: row.id,
              data: {
                quantity: quantityChanged ? newQuantity : undefined,
                sellingPrice: priceChanged ? newPrice : undefined,
              },
            });
            const savedId = row.id;
            setOriginalItemsById((prev) => ({ ...prev, [savedId]: { quantity: newQuantity, sellingPrice: newPrice } }));
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
          paymentMethod: paymentMethod as any,
          bankPayments: validatedBankPayments,
          city: city || undefined,
          fromAddress: fromAddress || undefined,
          pincode: pincode || undefined,
          sellingAmount: effectiveSellingAmount,
          collectedAmount: effectiveCollectedAmount,
          notes: notes || undefined,
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
    }));
    const itemsTotal = forItems.reduce(
      (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0),
      0
    );
    const sellingAmountForItems = sellingAmountManuallyEdited ? Number(manualSellingAmount) || 0 : itemsTotal;

    // Bank Account isn't applicable to Cash/Other — never submit a stale selection carried
    // over from a different payment method. Rows were already validated in handleSubmit before
    // this is called (including via the stock-shortage resolution paths, which run after it).
    const bankPaymentsPayload =
      paymentMethod === "Cash" || paymentMethod === "Other"
        ? []
        : bankPayments
            .filter((row) => row.bankAccountId && Number(row.amount) > 0)
            .map((row) => ({ bankAccountId: Number(row.bankAccountId), amount: Number(row.amount) }));

    return {
      customerId: customerId || undefined,
      customerName: customerName.trim(),
      customerNumber: customerNumber || undefined,
      platform: resolvedPlatform,
      to: to || "Madhuram Motor",
      courierName: resolvedCourierName || undefined,
      courierCharge: Number(courierCharge) || 0,
      paymentMethod,
      bankPayments: bankPaymentsPayload,
      city: city || undefined,
      fromAddress: fromAddress || undefined,
      pincode: pincode || undefined,
      sellingAmount: sellingAmountForItems,
      collectedAmount: effectiveCollectedAmount,
      notes: notes || undefined,
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
                  placeholder="Search..."
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
                      {sell.createdAt
                        ? formatDisplayDate(sell.createdAt)
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
                              onClick={() => openEditModal(sell)}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
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
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPaymentMethod(value);
                        // Bank Account isn't applicable to Cash/Other — clear any rows entered
                        // while a different method was active.
                        if (value === "Cash" || value === "Other") setBankPayments([]);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

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

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bank Account Split{" "}
                      <span className="font-normal text-slate-400">(optional — split the paid amount across bank accounts)</span>
                    </label>
                    {(() => {
                      const isBankPaymentsDisabled = paymentMethod === "Cash" || paymentMethod === "Other";
                      return (
                        <div
                          className={`rounded-lg border border-slate-200 bg-slate-50 p-2.5 ${
                            isBankPaymentsDisabled ? "opacity-50" : ""
                          }`}
                        >
                          {isBankPaymentsDisabled ? (
                            <p className="text-[10px] text-slate-400">Not applicable for {paymentMethod} payments.</p>
                          ) : bankAccountsList.length === 0 ? (
                            <p className="text-[10px] text-amber-600">
                              No bank accounts configured yet — add one under Account → Manage Bank Account Details.
                            </p>
                          ) : (
                            <>
                              {bankPayments.length === 0 && (
                                <p className="text-[10px] text-slate-400 mb-2">
                                  No bank account rows added — add one to record which bank(s) the payment went into.
                                </p>
                              )}
                              <div className="space-y-2">
                                {bankPayments.map((row, index) => (
                                  <div key={index} className="flex items-center gap-2">
                                    <select
                                      value={row.bankAccountId}
                                      onChange={(e) =>
                                        handleBankPaymentChange(
                                          index,
                                          "bankAccountId",
                                          e.target.value ? Number(e.target.value) : ""
                                        )
                                      }
                                      className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                    >
                                      <option value="">-- Select Bank Account --</option>
                                      {bankAccountsList.map((acc) => (
                                        <option key={acc.id} value={acc.id}>
                                          {acc.bankName} — {acc.accountHolderName}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={row.amount}
                                      onChange={(e) => handleBankPaymentChange(index, "amount", e.target.value)}
                                      onWheel={blurNumberInputOnWheel}
                                      placeholder="Amount"
                                      className="w-28 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveBankPaymentRow(index)}
                                      className="rounded p-1 text-slate-400 hover:text-rose-600 transition"
                                      title="Remove Row"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={handleAddBankPaymentRow}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  <Plus className="h-3 w-3" /> Add Payment Row
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
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

                <div className="space-y-3">
                  {items.map((row, index) => {
                    const selectedProd = productsList.find(
                      (p) => p.id === Number(row.productId)
                    );
                    const isNotStockTracked = selectedProd?.productType === "SOFTWARE" || selectedProd?.productType === "HARDWARE_ORDER_BASED";
                    const stockQty = selectedProd ? (selectedProd.available ?? 0) : 0;
                    const isShort =
                      !isNotStockTracked &&
                      row.productId &&
                      stockQty < (Number(row.quantity) || 1);

                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2.5 rounded-lg bg-white p-3 border border-slate-200 shadow-sm"
                      >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-slate-400 w-5">
                          #{index + 1}
                        </span>

                        {/* Product Dropdown */}
                        <div className="flex-1 w-full sm:w-auto">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Product *
                          </label>
                          <ProductSearchSelect
                            products={productsList}
                            value={row.productId}
                            onChange={(productId) => handleProductSelect(index, productId)}
                            disabled={!!row.id}
                            isLoading={isProductsLoading}
                            fallbackLabel={row.productName}
                            title={row.id ? "An existing line's product can't be changed — add a new product row instead" : undefined}
                          />
                        </div>

                        {/* Stock indicator badge */}
                        {row.productId && (
                          <div className="sm:pt-4">
                            {selectedProd?.productType === "SOFTWARE" ? (
                              <span className="rounded bg-purple-50 border border-purple-200 px-2 py-1 text-[10px] font-bold text-purple-700 whitespace-nowrap">
                                No stock tracking
                              </span>
                            ) : selectedProd?.productType === "HARDWARE_ORDER_BASED" ? (
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                      Collected Amount (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      readOnly={bankPayments.length > 0}
                      value={bankPayments.length > 0 ? String(effectiveCollectedAmount) : collectedAmount}
                      onFocus={(e) => {
                        // Typing into the default "0" appends after it (e.g. "0" + "5" = "05")
                        // instead of replacing it — clear it on focus so the first keystroke starts fresh.
                        if (e.target.value === "0") setCollectedAmount("");
                      }}
                      onBlur={() => {
                        if (collectedAmount.trim() === "") setCollectedAmount("0");
                      }}
                      onChange={(e) => setCollectedAmount(e.target.value)}
                      onWheel={blurNumberInputOnWheel}
                      placeholder="0.00"
                      className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-emerald-600 focus:border-[#3d6fe0] focus:outline-none ${
                        bankPayments.length > 0 ? "bg-slate-100" : "bg-white"
                      }`}
                    />
                    {selectedSale && (
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {Number(selectedSale.collectedAmount ?? 0) === 0
                          ? "Enter the amount actually collected — it's recorded as this sale's payment automatically."
                          : "Increasing this records an additional payment; decreasing it records a correction. To log a same-day payment with its own method/notes instead, use \"Record Payment\" in the sale details."}
                      </p>
                    )}
                    {bankPayments.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Auto-filled from the bank split rows below.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pending Amount (₹)
                    </label>
                    <div
                      className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold ${pendingAmount > 0
                        ? "bg-rose-50 text-rose-600"
                        : "bg-slate-100 text-slate-500"
                        }`}
                    >
                      ₹{pendingAmount.toLocaleString("en-IN")}
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Auto-calculated: Selling − Collected
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
                    onChange={(e) => setCreateCourierEntry(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#3d6fe0] focus:ring-[#3d6fe0]"
                  />
                  <label htmlFor="createCourierEntry" className="text-xs font-semibold text-slate-700">
                    Create Courier Entry
                  </label>
                </div>
                {selectedSale && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Changing this creates or cancels the shipment tracking entries for this sale's items.
                  </p>
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

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Selling Amount
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    ₹{Number(detail.sellingAmount).toLocaleString("en-IN")}
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
                              {p.method === "BankTransfer" && p.bankAccount && (
                                <div className="text-[10px] text-slate-400">{p.bankAccount.bankName} — {p.bankAccount.accountNumber}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-600">{p.creator?.name || "—"}</td>
                            <td className="p-2.5 text-right font-bold text-emerald-600">
                              ₹{Number(p.amount).toLocaleString("en-IN")}
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
                  <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-lg bg-emerald-50/60 border border-emerald-100 p-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-0.5">Amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={Number(detail.pendingAmount)}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        onWheel={blurNumberInputOnWheel}
                        placeholder="0.00"
                        className="w-24 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-0.5">Method</label>
                      <select
                        value={paymentMethodInput}
                        onChange={(e) => setPaymentMethodInput(e.target.value)}
                        className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    {paymentMethodInput === "BankTransfer" && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-0.5">Bank Account</label>
                        <select
                          value={bankAccountIdInput}
                          onChange={(e) => setBankAccountIdInput(e.target.value ? Number(e.target.value) : "")}
                          className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                        >
                          <option value="">Select account</option>
                          {bankAccountsList.map((acc) => (
                            <option key={acc.id} value={acc.id}>{acc.bankName} — {acc.accountNumber}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex-1  x">
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-0.5">Note (optional)</label>
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="e.g. remaining balance"
                        className="w-full rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={recordPaymentMutation.isPending || !detail.id}
                      onClick={() => {
                        const amt = Number(paymentAmount);
                        if (!detail.id || !amt || amt <= 0) {
                          toast.error("Enter a valid payment amount");
                          return;
                        }
                        recordPaymentMutation.mutate({
                          saleId: detail.id,
                          amount: amt,
                          method: paymentMethodInput,
                          bankAccountId: paymentMethodInput === "BankTransfer" ? (bankAccountIdInput || null) : null,
                          notes: paymentNotes || undefined,
                        });
                      }}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                    </button>
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

    </div>
  );
};

export default Sells;
