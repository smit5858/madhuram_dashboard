import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, Download, Loader2 } from "lucide-react";

export type ExportFormat = "pdf" | "excel";

interface ExportDropdownProps {
  /** Calls the module's export API (a blob response) for the chosen format. */
  onExport: (format: ExportFormat) => Promise<{ data: Blob }>;
  /** Download file name prefix, e.g. "income" -> income-export-<timestamp>.xlsx */
  filePrefix: string;
  /** Overrides the default `<filePrefix>-export-<timestamp>` download name. */
  fileName?: (format: ExportFormat) => string;
  /** When set, shown as a success toast after the file downloads. */
  successMessage?: string;
}

const MIME_TYPE: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Same Export button + PDF/Excel menu as the Sells page, packaged for reuse.
const ExportDropdown = ({ onExport, filePrefix, fileName, successMessage }: ExportDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;
    setIsOpen(false);
    setExporting(format);
    try {
      const res = await onExport(format);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: MIME_TYPE[format] }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName ? fileName(format) : `${filePrefix}-export-${Date.now()}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      if (successMessage) toast.success(successMessage);
    } catch (err: unknown) {
      // A blob responseType also wraps the JSON error body in a Blob — unwrap it for the message.
      let message = "Export failed";
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try {
          message = JSON.parse(await data.text())?.message || message;
        } catch {
          /* non-JSON body — keep the generic message */
        }
      }
      toast.error(message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        disabled={exporting !== null}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Export
        <ChevronDown className="h-3 w-3" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            Export as PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport("excel")}
            className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            Export as Excel
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportDropdown;
