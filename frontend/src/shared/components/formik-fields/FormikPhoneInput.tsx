import _ from 'lodash';
import React, { useLayoutEffect, useRef } from 'react';
import './custom.css'
import { normalizePhoneDigits, formatPhoneDisplay } from '../../utils/phone';

interface FormikPhoneInputProps {
    field: {
        name: string;
        value: string;
        onBlur: React.FocusEventHandler;
    };
    form: {
        touched: any;
        errors: any;
        setFieldValue: (field: string, value: string) => void;
    };
    label?: string;
    placeholder?: string;
    className?: string;
    id?: string;
    controlClassName?: string;
}

/** Phone-number field: strips everything but digits and caps at 10 on every keystroke (typed or
 *  pasted), storing the raw 10-digit value in Formik (matching the `^\d{10}$` shape every phone
 *  Zod schema expects) while displaying it grouped as "00000 00000" via formatPhoneDisplay.
 *  FormikInput can't do this — it spreads Formik's plain {...field} (value/onChange) straight
 *  onto the <input>, so there's nowhere to intercept and transform what the user types. */
const FormikPhoneInput = ({
    field,
    form,
    label,
    placeholder,
    className = '',
    id,
    controlClassName = '',
}: FormikPhoneInputProps): React.ReactNode => {
    const { touched, errors, setFieldValue } = form;
    const inputRef = useRef<HTMLInputElement>(null);
    const caretDigitsRef = useRef<number | null>(null);

    const error = _.get(errors, field.name);
    const touchedField = _.get(touched, field.name);

    const hasError = Boolean(touchedField && error);

    const displayValue = formatPhoneDisplay(field.value);

    // Restore the caret after a reformat (e.g. typing/deleting before the inserted space would
    // otherwise reset). Runs after the re-render that displayValue caused.
    useLayoutEffect(() => {
        if (caretDigitsRef.current === null || !inputRef.current) return;
        const digitsBeforeCaret = caretDigitsRef.current;
        const caretPos = digitsBeforeCaret + (digitsBeforeCaret > 5 ? 1 : 0);
        inputRef.current.setSelectionRange(caretPos, caretPos);
        caretDigitsRef.current = null;
    }, [displayValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const caret = e.target.selectionStart ?? raw.length;
        caretDigitsRef.current = raw.slice(0, caret).replace(/\D/g, '').length;
        setFieldValue(field.name, normalizePhoneDigits(raw));
    };

    return (
        <div className={`form-field ${controlClassName}`}>

            {label && (
                <label
                    htmlFor={id || field.name}
                    className="form-input-label"
                >
                    {label}
                </label>
            )}

            <div className="form-input-wrapper">
                <input
                    ref={inputRef}
                    id={id || field.name}
                    name={field.name}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder={placeholder}
                    maxLength={11}
                    value={displayValue}
                    onChange={handleChange}
                    onBlur={field.onBlur}
                    className={`form-input ${hasError ? 'form-input-error' : ''} ${className}`}
                />
            </div>

            {hasError && (
                <div className="formik-input-error">
                    {error}
                </div>
            )}
        </div>
    );
};

export default FormikPhoneInput;
