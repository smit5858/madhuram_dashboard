import _ from 'lodash';
import React, { useState } from 'react';
import { blurNumberInputOnWheel } from '@/shared/utils/input';
import './custom.css'

interface FormikInputProps {
    field: any;
    form: {
        touched: any;
        errors: any;
    };
    label?: string;
    type?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    placeholder?: string;
    className?: string;
    id?: string;
    maxLength?: number;
    multiline?: boolean;
    controlClassName?: string;
    showPasswordToggle?: boolean;
}

const FormikInput = ({
    field,
    form,
    label,
    type = 'text',
    inputMode,
    placeholder,
    className = '',
    id,
    maxLength,
    multiline = false,
    controlClassName = '',
    showPasswordToggle = false,
}: FormikInputProps): React.ReactNode => {
    const [showPassword, setShowPassword] = useState(false);

    const { touched, errors } = form;

    const error = _.get(errors, field.name);
    const touchedField = _.get(touched, field.name);

    const hasError = Boolean(touchedField && error);

    const inputType =
        type === 'password' && showPassword
            ? 'text'
            : type;

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

                {multiline ? (
                    <textarea
                        {...field}
                        id={id || field.name}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        className={`form-input ${hasError ? 'form-input-error' : ''} ${className}`}
                    />
                ) : (
                    <input
                        {...field}
                        id={id || field.name}
                        type={inputType}
                        inputMode={inputMode}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        className={`form-input ${hasError ? 'form-input-error' : ''} ${className}`}
                        autoComplete={
                            type === 'password'
                                ? 'current-password'
                                : 'email'
                        }
                        onWheel={type === 'number' ? blurNumberInputOnWheel : undefined}
                    />
                )}

                {showPasswordToggle && type === 'password' && (
                    <button
                        type="button"
                        className="password-toggle"
                        onClick={() =>
                            setShowPassword((prev) => !prev)
                        }
                        tabIndex={-1}
                        aria-label={
                            showPassword
                                ? 'Hide password'
                                : 'Show password'
                        }
                    >
                        {showPassword ? (
                            <svg
                                width="21"
                                height="21"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        ) : (
                            <svg
                                width="21"
                                height="21"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M3 3l18 18" />
                                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                                <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18.3 18.3 0 0 1-3.1 4.2" />
                                <path d="M6.6 6.6C3.8 8.5 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 4.1-.8" />
                            </svg>
                        )}
                    </button>
                )}
            </div>

            {hasError && (
                <div className="formik-input-error">
                    {error}
                </div>
            )}
        </div>
    );
};

export default FormikInput;