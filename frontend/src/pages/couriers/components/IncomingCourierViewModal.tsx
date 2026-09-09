import type { ReactNode } from "react";
import {
  Building2,
  Calendar,
  CalendarCheck,
  Clock,
  ExternalLink,
  FileText,
  Hash,
  MapPin,
  Package,
  PackageSearch,
  Phone,
  XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { CourierData } from "../../../services/courier.service";
import courierCompanyService, { buildTrackingLink } from "../../../services/courierCompany.service";
import { STATUS_LABEL, STATUS_BADGE_CLASS } from "../../../shared/constants/courierStatus";
import { formatDateTime, formatDisplayDate } from "../../../shared/utils/date";

const Badge = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
    {children}
  </span>
);

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

interface IncomingCourierViewModalProps {
  courier: CourierData;
  onClose: () => void;
}

/** Read-only display of an Incoming Courier record. Dedicated component (not shared with
 *  Outgoing's CourierViewModal) — Incoming records never carry sale/shipment/serial-number
 *  context, and instead show the Reason it was sent in and, once processed, which Outgoing
 *  Courier record it was converted to. */
const IncomingCourierViewModal = ({ courier, onClose }: IncomingCourierViewModalProps) => {
  const { data: companiesResponse } = useQuery({
    queryKey: ["courier-companies-picker"],
    queryFn: () => courierCompanyService.getCourierCompanies(),
    enabled: !!courier.courierName && !!courier.trackId,
  });
  const matchedCompany = (companiesResponse?.data?.data || []).find((c) => c.name === courier.courierName);
  const trackingLink = buildTrackingLink(matchedCompany?.trackingLinkTemplate, courier.trackId);

  const status = courier.status || "PENDING";

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#3d6fe0]">
              <PackageSearch className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900">
                {courier.customerName || courier.name || "Incoming Courier"}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge className={STATUS_BADGE_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
              </div>
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

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          {courier.linkedCourierId && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Converted</div>
              <div className="mt-0.5 text-sm font-medium text-slate-800">
                Sent to Outgoing Courier #{courier.linkedCourierId}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Section title="Contact & Address">
              <DetailItem icon={Phone} label="Mobile No." value={courier.mobileNo || courier.phone} />
              <DetailItem icon={MapPin} label="City" value={courier.city} />
              <DetailItem icon={Hash} label="Pincode" value={courier.pincode} />
              <DetailItem icon={MapPin} label="Address" value={courier.address} full />
            </Section>

            <Section title="Product & Reason">
              <DetailItem icon={Package} label="Product Name" value={courier.productName} />
              <DetailItem icon={FileText} label="Reason" value={courier.reason} />
            </Section>

            <Section title="Courier Details">
              <DetailItem icon={Building2} label="Courier Company" value={courier.courierName} />
              <DetailItem
                icon={Hash}
                label="Tracking Number"
                value={
                  courier.trackId ? (
                    trackingLink ? (
                      <a
                        href={trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {courier.trackId} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      courier.trackId
                    )
                  ) : undefined
                }
              />
            </Section>

            <Section title="Timeline">
              <DetailItem icon={Calendar} label="Date" value={formatDisplayDate(courier.entryDate)} />
              <DetailItem icon={Calendar} label="Submitted" value={formatDateTime(courier.createdAt)} />
              {courier.updatedAt && courier.updatedAt !== courier.createdAt && (
                <DetailItem icon={Clock} label="Last Updated" value={formatDateTime(courier.updatedAt)} />
              )}
              <DetailItem icon={CalendarCheck} label="Completed Date" value={formatDisplayDate(courier.completedDate)} />
            </Section>

            {courier.note && (
              <Section title="Other Relevant Information">
                <div className="sm:col-span-2 flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{courier.note}</p>
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-white px-6 py-4">
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

export default IncomingCourierViewModal;
