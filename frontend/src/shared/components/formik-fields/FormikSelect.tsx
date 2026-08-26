import _ from 'lodash';
import React from 'react';
import './custom.css'

interface FormikSelectOption {
    value: string | number;
    label: string;
}

interface FormikSelectProps {
    field: any;
    form: {
        touched: any;
        errors: any;
    };
    label?: string;
    options: FormikSelectOption[];
    placeholder?: string;
    className?: string;
    id?: string;
    controlClassName?: string;
}

const FormikSelect = ({
    field,
    form,
    label,
    options,
    placeholder,
    className = '',
    id,
    controlClassName = '',
}: FormikSelectProps): React.ReactNode => {
    const { touched, errors } = form;

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
                <select
                    {...field}
                    id={id || field.name}
                    className={`form-input ${hasError ? 'form-input-error' : ''} ${className}`}
                >
                    {placeholder && <option value="">{placeholder}</option>}
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>

            {hasError && (
                <div className="formik-input-error">
                    {error}
                </div>
            )}
        </div>
    );
};

export default FormikSelect;
