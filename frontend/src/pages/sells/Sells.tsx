import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Plus, RotateCcw, Trash2, Eye, Edit2, AlertTriangle, CheckCircle2, XCircle, Package, IndianRupee, ShoppingBag, Search as SearchIcon, Download, ChevronDown, UserCheck, Loader2 } from "lucide-react";
import { Formik, Form, Field, useFormikContext } from "formik";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import saleService, {
  type SaleData,
  type CreateSalePayload,
  type SalesFilters,
} from "../../services/sells.service";
import productService, {
  type ProductData,
} from "../../services/product.service";
import customerService, { type CustomerData } from "../../services/customer.service";

interface FormItem {
  productId: number | "";
  quantity: number | "";
  sellingPrice: number | "";
}

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "COD",
  "BankTransfer",
  "Other",
] as const;

const PLATFORMS = [
  "Direct Store",
  "Website",
  "WhatsApp",
  "Phone Call",
  "Instagram",
  "IndiaMART",
  "Other",
];

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<SalesFilters>>;
}) => {
  const { values } = useFormikContext<{ search: string; startDate: string; endDate: string }>();
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
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.startDate, values.endDate]);

  return null;
};

const Sells = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);

  // Permission derivation
  const pagePermission = useMemo(() => {
    if (!permissions)
      return {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
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
      }
    );
  }, [permissions]);

  // Filters State
  const [appliedFilters, setAppliedFilters] = useState<SalesFilters>({});
  const [pageSize] = useState(10);
  const [isExportOpen, setIsExportOpen] = useState(false);

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

  // Query: Products List (for dropdowns and stock display)
  const { data: productsResponse } = useQuery({
    queryKey: ["products"],
    queryFn: () => productService.getProducts(),
  });

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

  // Quick Product Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductDesc, setNewProductDesc] = useState("");

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
  const [paymentMethod, setPaymentMethod] = useState<string>("UPI");
  const [city, setCity] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [collectedAmount, setCollectedAmount] = useState<string>("0");
  const [manualSellingAmount, setManualSellingAmount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormItem[]>([
    { productId: "", quantity: 1, sellingPrice: "" },
  ]);

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

  const effectiveSellingAmount =
    manualSellingAmount !== ""
      ? Number(manualSellingAmount) || 0
      : calculatedItemsTotal;

  const pendingAmount = Math.max(
    0,
    effectiveSellingAmount - (Number(collectedAmount) || 0)
  );

  // Mutation: Create Product (Quick Add)
  const createProductMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      productService.createProduct(data),
    onSuccess: (res) => {
      toast.success("Product created successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setIsProductModalOpen(false);
      setNewProductName("");
      setNewProductDesc("");
      // Automatically select in the latest item row if empty
      if (res.data?.data?.id) {
        setItems((prev) => {
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          if (copy[lastIdx] && !copy[lastIdx].productId) {
            copy[lastIdx].productId = res.data.data.id;
          }
          return copy;
        });
      }
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || err.message || "Failed to create product"
      );
    },
  });

  // Mutation: Create Sale
  const createSaleMutation = useMutation({
    mutationFn: (payload: CreateSalePayload) => saleService.createSale(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Sells entry created successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      closeModal();
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
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || err.message || "Failed to update sale"
      );
    },
  });

  // Mutation: Delete Sale
  const deleteSaleMutation = useMutation({
    mutationFn: (id: number) => saleService.deleteSale(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Sale cancelled successfully");
      queryClient.invalidateQueries({ queryKey: ["sells"] });
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || err.message || "Failed to delete sale"
      );
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
    setPlatform("Direct Store");
    setPaymentMethod("UPI");
    setCity("");
    setFromAddress("");
    setPincode("");
    setCollectedAmount("0");
    setManualSellingAmount("");
    setNotes("");
    setItems([{ productId: "", quantity: 1, sellingPrice: "" }]);
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
    setPlatform(sale.platform || "Direct Store");
    setPaymentMethod(sale.paymentMethod || "UPI");
    setCity(sale.city || "");
    setFromAddress(sale.fromAddress || "");
    setPincode(sale.pincode || "");
    setCollectedAmount(String(sale.collectedAmount ?? 0));
    setManualSellingAmount(String(sale.sellingAmount ?? 0));
    setNotes(sale.notes || "");
    if (sale.items && sale.items.length > 0) {
      setItems(
        sale.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          sellingPrice: i.sellingPrice,
        }))
      );
    } else {
      setItems([{ productId: "", quantity: 1, sellingPrice: "" }]);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toast.error("Customer name is required");
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

    const payloadItems = items.map((i) => ({
      productId: Number(i.productId),
      quantity: Number(i.quantity),
      sellingPrice: Number(i.sellingPrice) || 0,
    }));

    if (selectedSale?.id) {
      // Update existing sale
      updateSaleMutation.mutate({
        id: selectedSale.id,
        data: {
          customerId: customerId || undefined,
          customerName: customerName.trim(),
          customerNumber: customerNumber || undefined,
          platform,
          paymentMethod: paymentMethod as any,
          city: city || undefined,
          fromAddress: fromAddress || undefined,
          pincode: pincode || undefined,
          sellingAmount: effectiveSellingAmount,
          collectedAmount: Number(collectedAmount) || 0,
          notes: notes || undefined,
        },
      });
    } else {
      // Create new sale
      const createPayload: CreateSalePayload = {
        customerId: customerId || undefined,
        customerName: customerName.trim(),
        customerNumber: customerNumber || undefined,
        platform,
        paymentMethod,
        city: city || undefined,
        fromAddress: fromAddress || undefined,
        pincode: pincode || undefined,
        sellingAmount: effectiveSellingAmount,
        collectedAmount: Number(collectedAmount) || 0,
        notes: notes || undefined,
        items: payloadItems,
      };

      createSaleMutation.mutate(createPayload);
    }
  };

  const handleDelete = (id: number) => {
    if (
      window.confirm(
        "Are you sure you want to cancel this sale? This action will mark it as CANCELLED."
      )
    ) {
      deleteSaleMutation.mutate(id);
    }
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

  // Helper: Status badge
  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case "FULFILLED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Fulfilled
          </span>
        );
      case "CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            Confirmed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
            <XCircle className="h-3 w-3" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            Pending
          </span>
        );
    }
  };

  // Helper: Fulfillment / Stock indicator badge
  const renderItemStockIndicator = (item: any) => {
    if (
      item.fulfillmentStatus === "OUT_OF_STOCK" ||
      item.shortageQuantity === item.quantity
    ) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700"
          title="Product is Out of Stock"
        >
          <AlertTriangle className="h-3 w-3 text-red-600" /> Out of Stock (-1)
        </span>
      );
    }
    if (item.fulfillmentStatus === "PARTIAL" || item.shortageQuantity > 0) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
          title={`Shortage of ${item.shortageQuantity} units`}
        >
          <AlertTriangle className="h-3 w-3" /> Shortage: {item.shortageQuantity}
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
    <div className="p-6 bg-white rounded-xl shadow-md">
      {/* Filter Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik initialValues={{ search: "", startDate: "", endDate: "" }} onSubmit={() => { }}>
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
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">
                    Selling (₹)
                  </th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">
                    Collected (₹)
                  </th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">
                    Pending (₹)
                  </th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
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
                    <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                      ₹{Number(sell.sellingAmount || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-emerald-600 whitespace-nowrap">
                      ₹{Number(sell.collectedAmount || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold whitespace-nowrap">
                      <span
                        className={
                          Number(sell.pendingAmount) > 0
                            ? "text-rose-600"
                            : "text-slate-400"
                        }
                      >
                        ₹{Number(sell.pendingAmount || 0).toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {renderStatusBadge(sell.status)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-[11px] text-slate-500">
                      {sell.createdAt
                        ? new Date(sell.createdAt).toLocaleDateString()
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
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
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
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
                      onClick={() => setIsProductModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-3 w-3" /> Quick Add Product
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="inline-flex items-center gap-1 rounded-md bg-[#3d6fe0] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#3162d2]"
                    >
                      <Plus className="h-3 w-3" /> Add Item Row
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {items.map((row, index) => {
                    const selectedProd = productsList.find(
                      (p) => p.id === Number(row.productId)
                    );
                    const stockQty = selectedProd ? selectedProd.currentStock : 0;
                    const isShort =
                      row.productId &&
                      stockQty < (Number(row.quantity) || 1);

                    return (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 rounded-lg bg-white p-3 border border-slate-200 shadow-sm"
                      >
                        <span className="font-mono text-xs font-bold text-slate-400 w-5">
                          #{index + 1}
                        </span>

                        {/* Product Dropdown */}
                        <div className="flex-1 w-full sm:w-auto">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Product *
                          </label>
                          <select
                            value={row.productId}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "productId",
                                e.target.value ? Number(e.target.value) : ""
                              )
                            }
                            required
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                          >
                            <option value="">-- Select Product --</option>
                            {productsList.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Available Stock: {p.currentStock})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Stock indicator badge */}
                        {row.productId && (
                          <div className="sm:pt-4">
                            {stockQty <= 0 ? (
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
                              handleItemChange(
                                index,
                                "quantity",
                                e.target.value ? Number(e.target.value) : ""
                              )
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
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
                            placeholder="0.00"
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
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

                        {/* Remove Row Button */}
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
                      value={
                        manualSellingAmount !== ""
                          ? manualSellingAmount
                          : calculatedItemsTotal
                      }
                      onChange={(e) => setManualSellingAmount(e.target.value)}
                      placeholder={calculatedItemsTotal.toString()}
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
                      value={collectedAmount}
                      onChange={(e) => setCollectedAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-emerald-600 focus:border-[#3d6fe0] focus:outline-none"
                    />
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
                    createSaleMutation.isPending || updateSaleMutation.isPending
                  }
                  className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#3162d2] disabled:opacity-50"
                >
                  {createSaleMutation.isPending || updateSaleMutation.isPending
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

      {/* QUICK ADD PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Add New Master Product
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Create a new product record. Initial stock will be set to 0.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newProductName.trim()) return;
                createProductMutation.mutate({
                  name: newProductName.trim(),
                  description: newProductDesc.trim() || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Engine Oil 15W-40"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  rows={2}
                  placeholder="Optional details..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProductMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#3162d2]"
                >
                  {createProductMutation.isPending ? "Creating..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {isDetailOpen && selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-blue-600 uppercase">
                  {selectedSale.invoiceNumber}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Sale Details — {selectedSale.customerName}
                </h3>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
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
                    {selectedSale.platform || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Payment Method
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.paymentMethod || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    City
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.city || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Customer Phone
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.customerNumber || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    From Address
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.fromAddress || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Pincode
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.pincode || "—"}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                  Line Items & Inventory Impact
                </h4>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                      <tr>
                        <th className="p-2.5">Product</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Price</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                        <th className="p-2.5 text-center">Fulfillment / Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSale.items?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-900">
                            {item.Product?.name ||
                              item.productName ||
                              `Product #${item.productId}`}
                          </td>
                          <td className="p-2.5 text-center font-bold">
                            {item.quantity}
                          </td>
                          <td className="p-2.5 text-right">
                            ₹{Number(item.sellingPrice).toLocaleString("en-IN")}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            ₹
                            {(
                              item.quantity * Number(item.sellingPrice)
                            ).toLocaleString("en-IN")}
                          </td>
                          <td className="p-2.5 text-center">
                            {renderItemStockIndicator(item)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Selling Amount
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    ₹{Number(selectedSale.sellingAmount).toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Collected Amount
                  </span>
                  <span className="text-sm font-bold text-emerald-600">
                    ₹{Number(selectedSale.collectedAmount).toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Pending Amount
                  </span>
                  <span
                    className={`text-sm font-bold ${Number(selectedSale.pendingAmount) > 0
                      ? "text-rose-600"
                      : "text-slate-600"
                      }`}
                  >
                    ₹{Number(selectedSale.pendingAmount).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {selectedSale.notes && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  <span className="text-blue-700 font-bold block text-[10px] uppercase">
                    Notes
                  </span>
                  <p className="text-slate-700 mt-0.5">{selectedSale.notes}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sells;
