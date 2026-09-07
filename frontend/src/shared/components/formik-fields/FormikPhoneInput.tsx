import _ from 'lodash';
import React from 'react';
import './custom.css'

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

/** Phone-number field: strips everything but digits and caps at 10 on every keystroke.
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

    const error = _.get(errors, field.name);
    const touchedField = _.get(touched, field.name);

    const hasError = Boolean(touchedField && error);

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
                    id={id || field.name}
                    name={field.name}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder={placeholder}
                    maxLength={10}
                    value={field.value ?? ''}
                    onChange={(e) => setFieldValue(field.name, e.target.value.replace(/\D/g, '').slice(0, 10))}
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
