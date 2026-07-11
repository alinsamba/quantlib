import React, { forwardRef, useId } from 'react';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;
    return (
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
        <input 
          id={inputId}
          ref={ref}
          className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all ${className}`}
          {...props}
        />
      </div>
    );
  }
);
TextField.displayName = 'TextField';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, options, className = '', id, ...props }, ref) => {
    const defaultId = useId();
    const selectId = id || defaultId;
    return (
      <div>
        <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
        <select 
          id={selectId}
          ref={ref}
          className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }
);
SelectField.displayName = 'SelectField';

interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const defaultId = useId();
    const textAreaId = id || defaultId;
    return (
      <div>
        <label htmlFor={textAreaId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
        <textarea 
          id={textAreaId}
          ref={ref}
          className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all ${className}`}
          {...props}
        />
      </div>
    );
  }
);
TextAreaField.displayName = 'TextAreaField';
