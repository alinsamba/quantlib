import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;
    return (
      <div>
        <label htmlFor={inputId} className="chalk-slate block text-xs font-bold uppercase tracking-wide text-[#5E6B65] dark:text-[#94A39D] mb-1.5">
          {label}
        </label>
        <input
          id={inputId}
          ref={ref}
          className={`chalk-input w-full px-3.5 py-2 text-sm bg-[#F5F6F2] dark:bg-[#121615] text-[#18201D] dark:text-[#EEF2EF] placeholder:text-[#8A9690] dark:placeholder:text-[#66746E] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F6F54]/25 dark:focus:ring-[#2E9472]/30 focus:border-[#1F6F54] dark:focus:border-[#2E9472] transition-all ${className}`}
          {...props}
        />
      </div>
    );
  }
);
TextField.displayName = 'TextField';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, options, className = '', id, value, onChange, disabled, required, name }, _ref) => {
    const defaultId = useId();
    const selectId = id || defaultId;
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [openUpward, setOpenUpward] = useState(false);

    const currentValue = value !== undefined ? String(value) : '';
    const selectedOption = options.find((opt) => opt.value === currentValue) || options[0];

    useEffect(() => {
      if (!open) return;
      const handleOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false);
          triggerRef.current?.focus();
        }
      };
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleEsc);
      return () => {
        document.removeEventListener('mousedown', handleOutside);
        document.removeEventListener('keydown', handleEsc);
      };
    }, [open]);

    const toggleOpen = () => {
      if (disabled) return;
      if (!open && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const estimatedMenuHeight = Math.min(240, options.length * 40 + 16);
        const spaceBelow = window.innerHeight - rect.bottom - 12;
        setOpenUpward(spaceBelow < estimatedMenuHeight && rect.top > spaceBelow);
      }
      setOpen((prev) => !prev);
    };

    const handleSelect = (optValue: string) => {
      setOpen(false);
      if (onChange) {
        const syntheticEvent = {
          target: { value: optValue, name: name || '' },
          currentTarget: { value: optValue, name: name || '' }
        } as ChangeEvent<HTMLSelectElement>;
        onChange(syntheticEvent);
      }
    };

    return (
      <div ref={containerRef}>
        {label && (
          <label htmlFor={selectId} className="chalk-slate block text-xs font-bold uppercase tracking-wide text-[#5E6B65] dark:text-[#94A39D] mb-1.5">
            {label}
          </label>
        )}

        {/* Hidden native input for HTML form required validation */}
        {required && (
          <input
            tabIndex={-1}
            aria-hidden="true"
            required
            value={currentValue}
            onChange={() => {}}
            className="sr-only"
          />
        )}

        <div className="relative">
          <button
            id={selectId}
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={toggleOpen}
            className={`chalk-input w-full flex items-center justify-between gap-2 text-left px-3.5 py-2 text-sm bg-[#F5F6F2] dark:bg-[#121615] text-[#18201D] dark:text-[#EEF2EF] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F6F54]/25 dark:focus:ring-[#2E9472]/30 focus:border-[#1F6F54] dark:focus:border-[#2E9472] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          >
            <span className={`truncate ${!selectedOption?.value ? 'opacity-70' : ''}`}>
              {selectedOption ? selectedOption.label : 'Select...'}
            </span>
            <ChevronDown
              size={15}
              className={`flex-shrink-0 text-[#5E6B65] dark:text-[#94A39D] transition-transform duration-150 ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>

          {open && (
            <ul
              role="listbox"
              className={`chalk-card absolute z-50 left-0 right-0 max-h-60 overflow-y-auto p-1 bg-white dark:bg-[#191F1E] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl shadow-lg ${
                openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
              }`}
            >
              {options.map((opt) => {
                const isSelected = opt.value === currentValue;
                return (
                  <li key={opt.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#e9dcc0] dark:bg-[#2E9472]/20 text-[#2b3a35] dark:text-[#63C7A4] font-semibold'
                          : 'text-[#2b3a35] dark:text-[#EEF2EF] hover:bg-[#eee4cf] dark:hover:bg-[#232C2A]'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <Check size={14} className="flex-shrink-0 text-[#a82c1d] dark:text-[#3FB08A]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }
);
SelectField.displayName = 'SelectField';

export interface AutocompleteOption {
  value: string;
  badge?: string;
}

interface AutocompleteFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: AutocompleteOption[];
}

export const AutocompleteField = forwardRef<HTMLInputElement, AutocompleteFieldProps>(
  ({ label, value, onChange, options, className = '', id, onFocus, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;
    const containerRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const query = value.trim().toLowerCase();
    const filtered = options
      .filter((opt) => !query || opt.value.toLowerCase().includes(query) || (opt.badge || '').toLowerCase().includes(query))
      .slice(0, 12);

    useEffect(() => {
      if (!open) return;
      const handleOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }, [open]);

    const pick = (val: string) => {
      onChange(val);
      setOpen(false);
      setActiveIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        pick(filtered[activeIndex].value);
      } else if (e.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    return (
      <div ref={containerRef}>
        <label htmlFor={inputId} className="chalk-slate block text-xs font-bold uppercase tracking-wide text-[#5E6B65] dark:text-[#94A39D] mb-1.5">
          {label}
        </label>
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            autoComplete="off"
            value={value}
            onFocus={(e) => {
              setOpen(true);
              onFocus?.(e);
            }}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            className={`chalk-input w-full px-3.5 py-2 text-sm bg-[#F5F6F2] dark:bg-[#121615] text-[#18201D] dark:text-[#EEF2EF] placeholder:text-[#8A9690] dark:placeholder:text-[#66746E] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F6F54]/25 dark:focus:ring-[#2E9472]/30 focus:border-[#1F6F54] dark:focus:border-[#2E9472] transition-all ${className}`}
            {...props}
          />
          {open && filtered.length > 0 && (
            <ul
              role="listbox"
              className="chalk-card absolute z-50 left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto p-1 bg-[#f6efe0] border-[1.5px] border-[#2b3a35] rounded-xl shadow-[3px_3px_0_#2b3a35]"
            >
              {filtered.map((opt, idx) => {
                const isExact = opt.value.toLowerCase() === query;
                const isActive = idx === activeIndex;
                return (
                  <li key={`${opt.value}-${opt.badge || idx}`} role="option" aria-selected={isExact}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(opt.value);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm rounded-lg transition-colors cursor-pointer ${
                        isActive || isExact
                          ? 'bg-[#e9dcc0] text-[#2b3a35] font-semibold'
                          : 'text-[#2b3a35] hover:bg-[#eee4cf]'
                      }`}
                    >
                      <span className="truncate">{opt.value}</span>
                      {opt.badge && (
                        <span className="flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#fbf8f1] border border-[#2b3a35] text-[#2f5749]">
                          {opt.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }
);
AutocompleteField.displayName = 'AutocompleteField';

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const defaultId = useId();
    const textAreaId = id || defaultId;
    return (
      <div>
        <label htmlFor={textAreaId} className="chalk-slate block text-xs font-bold uppercase tracking-wide text-[#5E6B65] dark:text-[#94A39D] mb-1.5">
          {label}
        </label>
        <textarea
          id={textAreaId}
          ref={ref}
          className={`chalk-input w-full px-3.5 py-2 text-sm bg-[#F5F6F2] dark:bg-[#121615] text-[#18201D] dark:text-[#EEF2EF] placeholder:text-[#8A9690] dark:placeholder:text-[#66746E] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F6F54]/25 dark:focus:ring-[#2E9472]/30 focus:border-[#1F6F54] dark:focus:border-[#2E9472] transition-all ${className}`}
          {...props}
        />
      </div>
    );
  }
);
TextAreaField.displayName = 'TextAreaField';
