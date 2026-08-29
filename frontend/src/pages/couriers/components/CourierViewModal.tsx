import { ExternalLink, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import courierService, { type CourierData } from "../../../services/courier.service";
import courierCompanyService, { buildTrackingLink } from "../../../services/courierCompany.service";
import { STATUS_LABEL, SHIPMENT_TYPE_LABEL, STATUS_BADGE_CLASS } from "../../../shared/constants/courierStatus";

const Field = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-0.5 text-sm text-slate-800">
      {value === undefined || value === null || value === "" ? (
        <span className="text-slate-300">—</span>
      ) : (
        value
      )}
    </div>
  </div>
);

interface CourierViewModalProps {
  courier: CourierData;
  onClose: () => void;
}

/** Read-only display of a courier record, plus (for sale-linked entries) the original order
 *  reference and every sibling shipment that came from the same sale — so it's immediately
 *  clear which products are available/shipping and which are still waiting on stock, even
 *  after a Ship Available Products split. */
const CourierViewModal = ({ courier, onClose }: CourierViewModalProps) => {
  const { data: siblingsResponse } = useQuery({
    queryKey: ["courier-view-siblings", courier.saleId],
    queryFn: () => courierService.getCouriers({ saleId: courier.saleId! }),
    enabled: !!courier.saleId,
  });
  const siblings = siblingsResponse?.data?.data || [];

  const { data: companiesResponse } = useQuery({
    queryKey: ["courier-companies-picker"],
    queryFn: () => courierCompanyService.getCourierCompanies(),
    enabled: !!courier.courierName && !!courier.trackId,
  });
  const matchedCompany = (companiesResponse?.data?.data || []).find((c) => c.name === courier.courierName);
  const trackingLink = buildTrackingLink(matchedCompany?.trackingLinkTemplate, courier.trackId);

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">Courier Record</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {courier.saleId && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Original Order</div>
            <div className="mt-0.5 text-sm text-slate-800">
              {courier.Sale?.invoiceNumber ? `Invoice ${courier.Sale.invoiceNumber}` : `Sale #${courier.saleId}`}
              {courier.Sale?.customerName ? ` — ${courier.Sale.customerName}` : ""}
            </div>
            {courier.shipmentType && (
              <div className="mt-1 text-xs text-slate-500">
                Shipment Decision: <span className="font-semibold text-slate-700">{SHIPMENT_TYPE_LABEL[courier.shipmentType]}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Name" value={courier.customerName || courier.name} />
          <Field label="Status" value={STATUS_LABEL[courier.status || "PENDING"]} />
          <Field label="Direction" value={courier.direction === "IN" ? "Incoming" : "Outgoing"} />
          <Field label="Mobile No." value={courier.mobileNo || courier.phone} />
          <Field label="Product Name" value={courier.productName} />
          <Field label="City" value={courier.city} />
          <Field label="Pincode" value={courier.pincode} />
          <Field label="Address" value={courier.address} />
          <Field label="Courier Company" value={courier.courierName} />
          <Field
            label="Track ID"
            value={
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
            }
          />
          <Field label="Weight (KG)" value={courier.kg !== undefined && courier.kg !== null ? `${courier.kg} kg` : undefined} />
          <Field label="Quantity" value={courier.quantity} />
          <Field label="Free Pickup" value={courier.freePickup ? "Yes" : "No"} />
          <Field label="Charge" value={courier.charge !== undefined && courier.charge !== null ? `₹${Number(courier.charge).toFixed(2)}` : undefined} />
          <Field label="Delivered Date" value={courier.completedDate} />
          <div className="sm:col-span-2">
            <Field label="Note" value={courier.note} />
          </div>
        </div>

        {siblings.length > 1 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Products in this Order
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Product</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Shipment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {siblings.map((s) => (
                    <tr key={s.id} className={s.id === courier.id ? "bg-blue-50/40" : ""}>
                      <td className="px-3 py-2 text-slate-700">
                        {s.productName}
                        {s.quantity ? ` × ${s.quantity}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASS[s.status || "PENDING"]}`}>
                          {STATUS_LABEL[s.status || "PENDING"]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{s.shipmentGroupId || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourierViewModal;
