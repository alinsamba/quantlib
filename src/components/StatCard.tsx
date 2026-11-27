import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'

export interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  variant?: 'primary' | 'success' | 'warning' | 'critical' | 'neutral'
  subtext?: ReactNode
  badgeText?: string
  onClick?: () => void
  drillDownLabel?: string
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  variant = 'primary',
  subtext,
  badgeText,
  onClick,
  drillDownLabel,
  className = ''
}: StatCardProps) {
  const variantStyles = {
    primary: {
      iconBg: 'bg-[#1F6F54]/10 dark:bg-[#2E9472]/15 text-[#1F6F54] dark:text-[#3FB08A]',
      badge: 'bg-[#1F6F54]/12 dark:bg-[#2E9472]/20 text-[#1F6F54] dark:text-[#63C7A4]'
    },
    success: {
      iconBg: 'bg-[#1F6F54]/10 dark:bg-[#2E9472]/15 text-[#1F6F54] dark:text-[#3FB08A]',
      badge: 'bg-[#1F6F54]/12 dark:bg-[#2E9472]/20 text-[#1F6F54] dark:text-[#63C7A4]'
    },
    warning: {
      iconBg: 'bg-[#D49A3A]/12 dark:bg-[#D49A3A]/15 text-[#A8741E] dark:text-[#E2B05C]',
      badge: 'bg-[#D49A3A]/15 text-[#9E6B18] dark:text-[#E2B05C]'
    },
    critical: {
      iconBg: 'bg-[#C8553D]/12 dark:bg-[#C8553D]/15 text-[#B8452E] dark:text-[#E4836E]',
      badge: 'bg-[#C8553D]/15 text-[#B8452E] dark:text-[#E4836E]'
    },
    neutral: {
      iconBg: 'bg-[#ECEFE8] dark:bg-[#222A28] text-[#5E6B65] dark:text-[#94A39D]',
      badge: 'bg-[#ECEFE8] dark:bg-[#222A28] text-[#5E6B65] dark:text-[#94A39D]'
    }
  }

  const currentVariant = variantStyles[variant]
  const isClickable = typeof onClick === 'function'

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`chalk-card bg-white dark:bg-[#191F1E] rounded-2xl p-5 border border-[#E3E6DE] dark:border-[#27302E] transition-all duration-150 flex flex-col justify-between ${
        isClickable
          ? 'cursor-pointer hover:border-[#1F6F54]/50 dark:hover:border-[#2E9472]/60 group focus:outline-none focus:ring-2 focus:ring-[#2E9472]/40'
          : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${
            isClickable ? 'group-hover:scale-105' : ''
          } ${currentVariant.iconBg}`}
        >
          {icon}
        </div>
        {badgeText && (
          <span
            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap ${currentVariant.badge}`}
          >
            {badgeText}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-[#18201D] dark:text-[#EEF2EF]">
          {value}
        </div>
        <div
          className="text-xs font-medium text-[#5E6B65] dark:text-[#94A39D] mt-1 truncate"
          title={label}
        >
          {label}
        </div>
      </div>

      {(subtext || drillDownLabel) && (
        <div className="mt-3 pt-3 border-t border-[#ECEFE8] dark:border-[#232C2A] flex items-center justify-between gap-2 text-xs text-[#5E6B65] dark:text-[#94A39D]">
          <div className="truncate font-medium min-w-0">{subtext}</div>
          {drillDownLabel && (
            <div className="flex items-center gap-1 font-semibold text-[#1F6F54] dark:text-[#3FB08A] group-hover:translate-x-0.5 transition-transform flex-shrink-0 whitespace-nowrap">
              <span>{drillDownLabel}</span>
              <ArrowRight size={12} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
