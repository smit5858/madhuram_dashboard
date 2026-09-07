import _ from 'lodash';
import React from 'react';
import './custom.css'

interface FormikCheckboxProps {
    field: any;
    form: {
        touched: any;
        errors: any;
    };
    label?: string;
    className?: string;
    id?: string;
    controlClassName?: string;
}

const FormikCheckbox = ({
    field,
    form,
    label,
    className = '',
    id,
    controlClassName = '',
}: FormikCheckboxProps): React.ReactNode => {
    const { touched, errors } = form;

    const error = _.get(errors, field.name);
    const touchedField = _.get(touched, field.name);

    const hasError = Boolean(touchedField && error);

    return (
        <div className={`form-field-checkbox ${controlClassName}`}>
            <label htmlFor={id || field.name} className="form-checkbox-label">
                <input
                    {...field}
                    id={id || field.name}
                    type="checkbox"
                    checked={!!field.value}
                    className={`form-checkbox-input ${className}`}
                />
                {label && <span>{label}</span>}
            </label>

            {hasError && (
                <div className="formik-input-error">
                    {error}
                </div>
            )}
        </div>
    );
};

export default FormikCheckbox;
