import _ from 'lodash';
import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import './custom.css';

/** Cap on rows rendered in the choice list at once — a searchable, scrollable list of a few
 *  hundred buttons is fine, but rendering thousands isn't; the search box narrows the rest. */
const MAX_RENDERED_CHOICES = 200;

interface FormikSerialPickerProps {
    field: { name: string; value?: string[] };
    form: {
        touched: any;
        errors: any;
        setFieldValue: (field: string, value: any) => void;
    };
    label?: string;
    /** Exact number of serials that must be selected — the line's assigned quantity. */
    requiredCount: number;
    /** Every serial this line may hold: the units currently assigned to it plus the AVAILABLE
     *  units of the same product, as supplied by the courier serials API. */
    options: string[];
    /** Serials currently picked by *other* product rows in the same shipment (same productId,
     *  different saleItemId) — excluded from this picker's choices so two sibling rows can never
     *  show the same unit as "selected" at once (only one PUT would actually win it server-side). */
    excludeSerials?: string[];
    controlClassName?: string;
}

/** Multi-select serial-number picker for a Formik field (value is a string[]), built to stay
 *  usable at any quantity: a "selected / required" counter, a compact scrollable list of what's
 *  selected, and a searchable, scrollable list of choices.
 *
 *  Swapping never requires unselecting first — with a quantity of 1, picking another serial
 *  replaces the current one; with more, click a selected serial to mark it for replacement and
 *  then click the serial to swap in. Duplicates and going over `requiredCount` are impossible. */
const FormikSerialPicker = ({
    field,
    form,
    label,
    requiredCount,
    options,
    excludeSerials = [],
    controlClassName = '',
}: FormikSerialPickerProps): React.ReactNode => {
    const { touched, errors, setFieldValue } = form;
    const error = _.get(errors, field.name);
    const touchedField = _.get(touched, field.name);
    const hasError = Boolean(touchedField && error);
    const selected: string[] = field.value || [];

    const [search, setSearch] = useState('');
    // The selected serial currently marked "to be replaced" (only used when requiredCount > 1).
    const [swapTarget, setSwapTarget] = useState<string | null>(null);
    const [hint, setHint] = useState('');

    const choices = useMemo(() => {
        const excluded = new Set(excludeSerials);
        return Array.from(new Set(options)).filter((s) => !excluded.has(s));
    }, [options, excludeSerials]);

    const query = search.trim().toLowerCase();
    const filtered = useMemo(
        () => (query ? choices.filter((s) => s.toLowerCase().includes(query)) : choices),
        [choices, query]
    );
    const visible = filtered.slice(0, MAX_RENDERED_CHOICES);

    const update = (next: string[]) => {
        setHint('');
        setFieldValue(field.name, next);
    };

    const pick = (serial: string) => {
        if (selected.includes(serial)) {
            if (swapTarget === serial) setSwapTarget(null);
            update(selected.filter((s) => s !== serial));
            return;
        }
        if (swapTarget && selected.includes(swapTarget)) {
            update(selected.map((s) => (s === swapTarget ? serial : s)));
            setSwapTarget(null);
            return;
        }
        if (selected.length < requiredCount) {
            update([...selected, serial]);
            return;
        }
        if (requiredCount === 1) {
            // Full with a single slot — replace directly, no manual unselect needed.
            update([serial]);
            return;
        }
        setHint('All serial numbers are selected — click a selected serial to replace it, or remove one first.');
    };

    const remove = (serial: string) => {
        if (swapTarget === serial) setSwapTarget(null);
        update(selected.filter((s) => s !== serial));
    };

    const fillRemaining = () => {
        const chosen = new Set(selected);
        const extra = choices.filter((s) => !chosen.has(s)).slice(0, Math.max(0, requiredCount - selected.length));
        update([...selected, ...extra]);
    };

    const complete = selected.length === requiredCount;

    return (
        <div className={`form-field sm:col-span-2 ${controlClassName}`}>
            {label && <label className="form-input-label">{label}</label>}
            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-xs font-semibold ${complete ? 'text-emerald-600' : 'text-amber-600'}`}>
                        Serial Numbers Selected: {selected.length} / {requiredCount}
                    </p>
                    {requiredCount > 1 && (
                        <div className="flex gap-2 text-[11px] font-semibold">
                            {selected.length < requiredCount && (
                                <button type="button" onClick={fillRemaining} className="text-[#3d6fe0] hover:underline">
                                    Auto-fill remaining
                                </button>
                            )}
                            {selected.length > 0 && (
                                <button type="button" onClick={() => { setSwapTarget(null); update([]); }} className="text-slate-500 hover:underline">
                                    Clear all
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-1.5 max-h-32 overflow-y-auto rounded border border-slate-200 bg-white p-1.5">
                    {selected.length === 0 ? (
                        <p className="text-xs text-slate-400">Nothing selected yet.</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {selected.map((serial) => {
                                const marked = swapTarget === serial;
                                return (
                                    <span
                                        key={serial}
                                        className={`inline-flex items-center overflow-hidden rounded border text-[11px] font-mono font-bold ${marked
                                            ? 'border-amber-400 bg-amber-50 text-amber-700 ring-2 ring-amber-200'
                                            : 'border-[#3d6fe0] bg-[#3d6fe0] text-white'
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            disabled={requiredCount === 1}
                                            onClick={() => setSwapTarget(marked ? null : serial)}
                                            title={requiredCount === 1 ? undefined : marked ? 'Replacing — pick a serial below' : 'Click to replace this serial'}
                                            className="px-2 py-1 disabled:cursor-default"
                                        >
                                            {serial}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(serial)}
                                            aria-label={`Remove ${serial}`}
                                            className="border-l border-white/30 px-1 py-1 hover:bg-black/10"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>

                {swapTarget && (
                    <p className="mt-1 text-[11px] text-amber-600">
                        Replacing <span className="font-mono font-bold">{swapTarget}</span> — pick the serial to use instead.
                    </p>
                )}

                <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={`Search ${choices.length} serial number${choices.length === 1 ? '' : 's'}…`}
                        className="block w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                    />
                </div>

                <div className="mt-1.5 max-h-52 overflow-y-auto rounded border border-slate-200 bg-white p-1.5">
                    {choices.length === 0 ? (
                        <p className="text-xs text-slate-400">No available serial numbers for this product.</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-xs text-slate-400">No serial numbers match "{search.trim()}".</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                            {visible.map((serial) => {
                                const isSelected = selected.includes(serial);
                                return (
                                    <button
                                        type="button"
                                        key={serial}
                                        aria-pressed={isSelected}
                                        onClick={() => pick(serial)}
                                        className={`flex items-center justify-between gap-1 rounded border px-2 py-1 text-left text-[11px] font-mono font-bold transition ${isSelected
                                            ? 'border-[#3d6fe0] bg-blue-50 text-[#3d6fe0]'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-[#3d6fe0]'
                                            }`}
                                    >
                                        <span className="truncate">{serial}</span>
                                        {isSelected && <Check className="h-3 w-3 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {filtered.length > visible.length && (
                        <p className="mt-1.5 text-center text-[10px] text-slate-400">
                            Showing {visible.length} of {filtered.length} — type in the search box to narrow down.
                        </p>
                    )}
                </div>

                {hint && <p className="mt-1 text-[11px] text-amber-600">{hint}</p>}
            </div>
            {hasError && (
                <div className="formik-input-error">
                    {error}
                </div>
            )}
        </div>
    );
};

export default FormikSerialPicker;
