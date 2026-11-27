import type { ReactNode, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  isLoading,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl transition-all duration-150 font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs font-medium',
    md: 'px-4 py-2 text-sm font-medium',
    lg: 'px-5 py-2.5 text-base font-semibold'
  };

  const variants = {
    primary:
      'chalk-btn-primary bg-[#1F6F54] hover:bg-[#195C45] active:bg-[#144D39] dark:bg-[#2E9472] dark:hover:bg-[#267D60] text-white shadow-xs focus:ring-[#2E9472]/50',
    secondary:
      'chalk-btn-secondary bg-white dark:bg-[#1F2725] border border-[#E3E6DE] dark:border-[#2C3634] text-[#18201D] dark:text-[#EEF2EF] hover:bg-[#F5F6F2] dark:hover:bg-[#26302E] focus:ring-[#2E9472]/30',
    ghost:
      'chalk-btn-ghost bg-transparent text-[#5E6B65] dark:text-[#94A39D] hover:bg-[#E9ECE5] dark:hover:bg-[#1F2725] hover:text-[#18201D] dark:hover:text-[#EEF2EF] focus:ring-[#2E9472]/30',
    danger:
      'chalk-btn-danger bg-[#C8553D] hover:bg-[#B04731] active:bg-[#993C29] text-white shadow-xs focus:ring-[#C8553D]/50'
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4 text-current flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
