import type { ReactNode } from 'react'
import { useTheme } from '../hooks/ThemeContext'
import { ChalkArt, type ChalkArtName } from './theme/ChalkArt'

interface EmptyStateProps {
  image: string
  chalkArt?: ChalkArtName
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({
  image,
  chalkArt = 'emptyTray',
  title,
  description,
  action,
  compact = false
}: EmptyStateProps) {
  const { theme } = useTheme()
  const isChalk = theme === 'chalk'

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4' : 'py-12 px-6'
      } ${isChalk ? 'chalk-empty-card m-4' : ''}`}
    >
      {isChalk ? (
        <div className="mb-4 p-3 rounded-xl bg-[#e9dcc0] border-[1.5px] border-[#2b3a35] shadow-[2px_2px_0_#2b3a35]">
          <ChalkArt name={chalkArt} size={compact ? 56 : 72} />
        </div>
      ) : (
        <div className="mb-4 rounded-2xl overflow-hidden bg-[#191F1E] p-2 shadow-xs border border-[#E3E6DE] dark:border-transparent">
          <img
            src={image}
            alt={title}
            className={`${compact ? 'w-24 h-24' : 'w-32 h-32'} object-contain select-none`}
            draggable={false}
          />
        </div>
      )}
      <h4 className="chalk-ink text-base font-bold text-[#18201D] dark:text-[#EEF2EF]">{title}</h4>
      <p className="chalk-muted text-sm text-[#5E6B65] dark:text-[#94A39D] mt-1 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
