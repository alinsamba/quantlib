interface ChalkHeroProps {
  activeLoans: number
  issuedToday: number
  dueToday: number
  overdueCount: number
  loanFilter: 'ALL' | 'OVERDUE' | 'DUE_TODAY'
  onFilterChange: (filter: 'ALL' | 'OVERDUE' | 'DUE_TODAY') => void
  onFocusIssue?: () => void
  onOpenClearance?: () => void
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning, Librarian'
  if (hour < 17) return 'Good afternoon, Librarian'
  return 'Good evening, Librarian'
}

export function ChalkHero({
  activeLoans,
  issuedToday,
  dueToday,
  overdueCount,
  loanFilter,
  onFilterChange,
  onFocusIssue,
  onOpenClearance
}: ChalkHeroProps) {
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  return (
    <section className="chalk-hero p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div className="space-y-3 max-w-2xl">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#2f5749]">
          <span>Circulation Desk</span>
          <span aria-hidden="true">·</span>
          <span>{dateStr}</span>
        </div>

        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em] text-[#2b3a35]">
          {getTimeGreeting()}
        </h1>

        <p className="text-sm text-[#4a5c55] leading-relaxed">
          {activeLoans === 0
            ? 'All library books are currently accounted for on the shelves. Ready for the next class break.'
            : `${activeLoans} active book loan${activeLoans === 1 ? '' : 's'} in circulation${
                overdueCount > 0 ? `, with ${overdueCount} overdue notice${overdueCount === 1 ? '' : 's'} needing follow-up` : ' — everything on schedule'
              }.`}
        </p>

        {/* Primary Red-Pen CTA + Cream-Paper Secondary CTA + Filter Pills */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {onFocusIssue && (
            <button
              type="button"
              onClick={onFocusIssue}
              className="chalk-btn-primary px-4 py-2 text-sm font-semibold cursor-pointer"
            >
              Issue a Book
            </button>
          )}
          {onOpenClearance && (
            <button
              type="button"
              onClick={onOpenClearance}
              className="chalk-btn-secondary px-4 py-2 text-sm font-semibold cursor-pointer"
            >
              End-of-Term Clearance
            </button>
          )}

          <div className="flex flex-wrap items-center gap-1.5 ml-0 sm:ml-2">
            <button
              type="button"
              onClick={() => onFilterChange('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums cursor-pointer transition-all ${
                loanFilter === 'ALL' ? 'chalk-pill-active' : 'chalk-pill hover:bg-[#eee4cf]'
              }`}
            >
              Active · {activeLoans}
            </button>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums bg-[#e9dcc0] text-[#1d5c43] border-[1.5px] border-[#2b3a35]">
              Issued Today · {issuedToday}
            </span>
            <button
              type="button"
              onClick={() => onFilterChange('DUE_TODAY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums cursor-pointer transition-all ${
                loanFilter === 'DUE_TODAY' ? 'chalk-pill-active' : 'chalk-pill hover:bg-[#eee4cf]'
              }`}
            >
              Due Today · {dueToday}
            </button>
            <button
              type="button"
              onClick={() => onFilterChange('OVERDUE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums cursor-pointer transition-all ${
                loanFilter === 'OVERDUE' ? 'chalk-pill-active' : 'chalk-pill hover:bg-[#eee4cf]'
              }`}
            >
              Overdue · {overdueCount}
            </button>
          </div>
        </div>
      </div>

      {/* Framed chalkboard bookplate featuring the signature wooden library desk */}
      <div className="flex items-center justify-start lg:justify-end flex-shrink-0">
        <div className="w-40 h-40 sm:w-44 sm:h-44 rounded-2xl bg-[#182120] border-[1.5px] border-[#2b3a35] shadow-[3px_3px_0_#2b3a35] overflow-hidden">
          <img
            src="/assets/unslop/quantlib-desk-emblem.webp"
            alt="Library circulation desk"
            className="w-full h-full object-cover scale-105 select-none"
            draggable={false}
          />
        </div>
      </div>
    </section>
  )
}
