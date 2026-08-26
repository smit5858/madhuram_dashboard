import _ from 'lodash';
import React from 'react';
import './custom.css'

interface FormikDateProps {
    field: any;
    form: {
        touched: any;
        errors: any;
    };
    label?: string;
    placeholder?: string;
    className?: string;
    id?: string;
    controlClassName?: string;
    min?: string;
    max?: string;
}

const FormikDate = ({
    field,
    form,
    label,
    placeholder,
    className = '',
    id,
    controlClassName = '',
    min,
    max,
}: FormikDateProps): React.ReactNode => {
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
                <input
                    {...field}
                    id={id || field.name}
                    type="date"
                    placeholder={placeholder}
                    min={min}
                    max={max}
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

export default FormikDate;
