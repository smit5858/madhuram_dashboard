import type { LucideIcon } from "lucide-react";

export type KpiColor = "blue" | "emerald" | "amber" | "indigo" | "rose" | "slate";

interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  icon: LucideIcon;
  color: KpiColor;
  onClick?: () => void;
  /** No click handler, muted styling — used for KPIs with no meaningful destination page
   *  (Net Profit, Payable). */
  disabled?: boolean;
}

// Visual idiom copied from the Sells.tsx KPI banner (rounded-2xl gradient card, icon chip,
// mono value) so the dashboard's cards match the one existing precedent in the app, extended
// with click-to-navigate and a disabled/informational state.
const COLOR_CLASSES: Record<KpiColor, { border: string; gradientFrom: string; chipBg: string; chipText: string; label: string; value: string }> = {
  blue: { border: "border-blue-100", gradientFrom: "from-blue-50/60", chipBg: "bg-blue-100", chipText: "text-blue-600", label: "text-blue-700", value: "text-slate-900" },
  emerald: { border: "border-emerald-100", gradientFrom: "from-emerald-50/60", chipBg: "bg-emerald-100", chipText: "text-emerald-600", label: "text-emerald-700", value: "text-emerald-700" },
  amber: { border: "border-amber-100", gradientFrom: "from-amber-50/60", chipBg: "bg-amber-100", chipText: "text-amber-600", label: "text-amber-700", value: "text-amber-700" },
  indigo: { border: "border-indigo-100", gradientFrom: "from-indigo-50/60", chipBg: "bg-indigo-100", chipText: "text-indigo-600", label: "text-indigo-700", value: "text-slate-900" },
  rose: { border: "border-rose-100", gradientFrom: "from-rose-50/60", chipBg: "bg-rose-100", chipText: "text-rose-600", label: "text-rose-700", value: "text-rose-700" },
  slate: { border: "border-slate-200", gradientFrom: "from-slate-50", chipBg: "bg-slate-100", chipText: "text-slate-400", label: "text-slate-500", value: "text-slate-400" },
};

const KpiCard = ({ label, value, caption, icon: Icon, color, onClick, disabled }: KpiCardProps) => {
  const c = COLOR_CLASSES[color];
  const clickable = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`rounded-2xl border ${c.border} bg-linear-to-br ${c.gradientFrom} to-white p-4 shadow-sm text-left w-full transition ${
        clickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "cursor-default"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wider ${c.label}`}>{label}</span>
        <div className={`rounded-xl ${c.chipBg} p-2 ${c.chipText}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className={`mt-2 text-2xl font-bold font-mono ${c.value}`}>{value}</div>
      {caption && <p className="mt-1 text-[11px] text-slate-500">{caption}</p>}
    </button>
  );
};

export default KpiCard;
