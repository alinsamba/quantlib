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
      iconBg: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50',
      badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
    },
    success: {
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50',
      badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
    },
    warning: {
      iconBg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50',
      badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
    },
    critical: {
      iconBg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50',
      badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
    },
    neutral: {
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
      badge: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
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
      className={`bg-white dark:bg-slate-800/90 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
        isClickable
          ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 group focus:outline-none focus:ring-2 focus:ring-blue-500'
          : ''
      } ${className}`}
    >
      {/* Top Row: 40x40 Icon Backdrop & Badge */}
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${isClickable ? 'group-hover:scale-105' : ''} ${currentVariant.iconBg}`}>
          {icon}
        </div>
        {badgeText && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${currentVariant.badge}`}>
            {badgeText}
          </span>
        )}
      </div>

      {/* Center: Metric Value (Bold 24px-30px) */}
      <div className="mt-4">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </div>
        {/* Bottom: Sub-label (12px, uppercase/muted) */}
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1 truncate">
          {label}
        </div>
      </div>

      {/* Optional Subtext or Drilldown Footer */}
      {(subtext || drillDownLabel) && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="truncate font-medium">
            {subtext}
          </div>
          {drillDownLabel && (
            <div className="flex items-center space-x-1 font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0">
              <span>{drillDownLabel}</span>
              <ArrowRight size={12} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
