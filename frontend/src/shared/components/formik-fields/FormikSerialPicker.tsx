import _ from 'lodash';
import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import inventoryService from '../../../services/inventory.service';
import './custom.css';

interface FormikSerialPickerProps {
    field: { name: string; value?: string[] };
    form: {
        touched: any;
        errors: any;
        setFieldValue: (field: string, value: any) => void;
    };
    label?: string;
    productId?: number;
    /** Exact number of serials that must be selected — the shipment's quantity. */
    requiredCount: number;
    /** Serial numbers already assigned to this shipment — shown alongside AVAILABLE ones and
     *  preferred when auto-selecting, so re-opening the form doesn't change the pick. */
    currentlyAssigned?: string[];
    controlClassName?: string;
}

/** Multi-select serial-number picker for a Formik field. Auto-selects the best available
 *  serials on first load (FIFO — the same oldest-received-first ordering the backend already
 *  applies), while remaining fully editable: click a chip to swap it out for another available
 *  unit. Field value is a string[] of selected serial numbers. */
const FormikSerialPicker = ({
    field,
    form,
    label,
    productId,
    requiredCount,
    currentlyAssigned = [],
    controlClassName = '',
}: FormikSerialPickerProps): React.ReactNode => {
    const { touched, errors, setFieldValue } = form;
    const error = _.get(errors, field.name);
    const touchedField = _.get(touched, field.name);
    const hasError = Boolean(touchedField && error);
    const selected: string[] = field.value || [];

    const { data: response, isFetching } = useQuery({
        queryKey: ["available-serials", productId],
        queryFn: () => inventoryService.getSerials({ productId, status: "AVAILABLE" }),
        enabled: !!productId,
    });
    const available = useMemo(() => (response?.data?.data || []).map((u) => u.serialNumber), [response]);

    const allChoices = useMemo(() => {
        const merged = [...available];
        for (const s of currentlyAssigned) {
            if (!merged.includes(s)) merged.push(s);
        }
        return merged;
    }, [available, currentlyAssigned]);

    // Auto-select once the choices are known, unless the field already has a value.
    const preselected = useRef(false);
    useEffect(() => {
        if (preselected.current || allChoices.length === 0 || selected.length > 0) return;
        preselected.current = true;

        const base = currentlyAssigned.filter((s) => allChoices.includes(s)).slice(0, requiredCount);
        const remaining = requiredCount - base.length;
        const extra = available.filter((s) => !base.includes(s)).slice(0, Math.max(0, remaining));
        setFieldValue(field.name, [...base, ...extra]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allChoices]);

    const toggle = (serial: string) => {
        if (selected.includes(serial)) {
            setFieldValue(field.name, selected.filter((s) => s !== serial));
        } else {
            if (selected.length >= requiredCount) return; // full — deselect one first
            setFieldValue(field.name, [...selected, serial]);
        }
    };

    return (
        <div className={`form-field sm:col-span-2 ${controlClassName}`}>
            {label && <label className="form-input-label">{label}</label>}
            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {isFetching && <p className="text-xs text-slate-400">Loading available serial numbers…</p>}
                {!isFetching && allChoices.length === 0 && (
                    <p className="text-xs text-slate-400">No available serial numbers for this product.</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                    {allChoices.map((serial) => {
                        const isSelected = selected.includes(serial);
                        return (
                            <button
                                type="button"
                                key={serial}
                                onClick={() => toggle(serial)}
                                className={`inline-flex items-center rounded px-2 py-1 text-[11px] font-mono font-bold border transition ${isSelected
                                    ? "bg-[#3d6fe0] border-[#3d6fe0] text-white"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-[#3d6fe0]"
                                    }`}
                            >
                                {serial}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">
                    {selected.length} of {requiredCount} selected
                </p>
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
