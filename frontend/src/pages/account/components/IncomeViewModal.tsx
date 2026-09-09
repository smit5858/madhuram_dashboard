import type { ReactNode } from "react";
import { Banknote, Calendar, FileText, Hash, IndianRupee, Package, Phone, User, Wallet, XCircle } from "lucide-react";
import type { IncomeEntryData } from "@/services/income.service";
import { PAYMENT_METHOD_LABEL } from "@/shared/constants/paymentMethod";
import { formatDateTime, formatDisplayDate } from "@/shared/utils/date";

const DetailItem = ({
  icon: Icon,
  label,
  value,
  full = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: ReactNode;
  full?: boolean;
}) => (
  <div className={`flex items-start gap-2.5 ${full ? "sm:col-span-2" : ""}`}>
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
      <Icon className="h-3.5 w-3.5" />
    </div>
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800 wrap-break-word">
        {value === undefined || value === null || value === "" ? (
          <span className="font-normal text-slate-300">Not provided</span>
        ) : (
          value
        )}
      </div>
    </div>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
    <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
    <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
  </div>
);

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

interface IncomeViewModalProps {
  entry: IncomeEntryData;
  onClose: () => void;
}

const IncomeViewModal = ({ entry, onClose }: IncomeViewModalProps) => {
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900">{entry.customerName}</h3>
              <div className="mt-1 text-xs text-slate-500">{formatCurrency(entry.amount)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4">
            <Section title="Customer">
              <DetailItem icon={User} label="Customer Name" value={entry.customerName} />
              <DetailItem icon={Phone} label="Phone" value={entry.customerPhone} />
            </Section>

            <Section title="Product">
              <DetailItem icon={Package} label="Product Name" value={entry.productName} />
              <DetailItem icon={Hash} label="Serial Number" value={entry.serialNumber} />
            </Section>

            <Section title="Transaction">
              <DetailItem icon={IndianRupee} label="Amount" value={formatCurrency(entry.amount)} />
              <DetailItem icon={Calendar} label="Date" value={formatDisplayDate(entry.entryDate)} />
              <DetailItem
                icon={Banknote}
                label="Payment Method"
                value={entry.paymentMethod ? PAYMENT_METHOD_LABEL[entry.paymentMethod] : undefined}
              />
              {entry.paymentMethod === "BankTransfer" && (
                <DetailItem icon={Banknote} label="Bank Name" value={entry.bankName} />
              )}
            </Section>

            {entry.description && (
              <Section title="Notes">
                <div className="sm:col-span-2 flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{entry.description}</p>
                </div>
              </Section>
            )}

            <Section title="Record Info">
              <DetailItem icon={User} label="Added By" value={entry.creator?.name} />
              <DetailItem icon={Calendar} label="Created" value={formatDateTime(entry.createdAt)} />
            </Section>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomeViewModal;
