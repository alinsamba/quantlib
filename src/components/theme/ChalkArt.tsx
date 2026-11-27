export type ChalkArtName =
  | 'books'
  | 'ledger'
  | 'learnerCap'
  | 'stamp'
  | 'bell'
  | 'clearanceSlip'
  | 'emptyTray'

interface ChalkArtProps {
  name: ChalkArtName
  size?: number
  className?: string
}

/**
 * Tier 2 — ChalkArt (64x64 multi-tone hand-crafted library illustrations)
 * Uses 2px #2b3a35 ink outlines, warm paper (#f6efe0 / #dfd0b0),
 * slate (#8fb5a5), ochre (#d9a23a / #ecc472), and red-pen (#a82c1d) accents.
 */
export function ChalkArt({ name, size = 64, className = '' }: ChalkArtProps) {
  const ink = '#2b3a35'
  const paper = '#fbf8f1'
  const paperShade = '#dfd0b0'
  const slate = '#2f5749'
  const slateLight = '#8fb5a5'
  const ochre = '#d9a23a'
  const ochreLight = '#ecc472'
  const red = '#a82c1d'

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    fill: 'none',
    className: `flex-shrink-0 select-none ${className}`,
    'aria-hidden': true as const
  }

  switch (name) {
    case 'books':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="56" rx="22" ry="3.5" fill={paperShade} />
          <rect x="10" y="40" width="44" height="12" rx="3" fill={ochre} stroke={ink} strokeWidth="2" />
          <rect x="16" y="44" width="32" height="4" rx="1" fill={paper} stroke={ink} strokeWidth="1.5" />
          <rect x="8" y="27" width="46" height="12" rx="3" fill={slateLight} stroke={ink} strokeWidth="2" />
          <rect x="14" y="31" width="34" height="4" rx="1" fill={paper} stroke={ink} strokeWidth="1.5" />
          <rect x="13" y="14" width="40" height="12" rx="3" fill={red} stroke={ink} strokeWidth="2" />
          <rect x="19" y="18" width="28" height="4" rx="1" fill={ochreLight} stroke={ink} strokeWidth="1.5" />
          <path d="M46 14v9l-3-2-3 2v-9" fill={ochre} stroke={ink} strokeWidth="1.5" />
        </svg>
      )
    case 'ledger':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="56" rx="22" ry="3.5" fill={paperShade} />
          <rect x="8" y="12" width="48" height="38" rx="4" fill={slate} stroke={ink} strokeWidth="2" />
          <rect x="11" y="15" width="20" height="32" rx="2" fill={paper} stroke={ink} strokeWidth="1.75" />
          <rect x="33" y="15" width="20" height="32" rx="2" fill={paper} stroke={ink} strokeWidth="1.75" />
          <path d="M15 22h12M15 28h10M15 34h12M15 40h8" stroke={ink} strokeWidth="1.75" strokeLinecap="round" />
          <path d="M37 22h11M37 28h11M37 34h8" stroke={paperShade} strokeWidth="2" strokeLinecap="round" />
          <path d="M37 21.5l2.2 2.2 4.3-4.5" stroke={red} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M37 33.5l2.2 2.2 4.3-4.5" stroke={red} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M44 41l10-10 3.5 3.5-10 10-4.5 1 1-4.5Z" fill={ochre} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'learnerCap':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="55" rx="20" ry="3.5" fill={paperShade} />
          <path d="M18 31v11c0 4 6.3 7 14 7s14-3 14-7V31" fill={slateLight} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <path d="M32 14L8 25l24 11 24-11-24-11Z" fill={slate} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <path d="M51 27.5v13" stroke={red} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="51" cy="42.5" r="3" fill={ochre} stroke={ink} strokeWidth="1.75" />
          <circle cx="32" cy="25" r="2.5" fill={ochreLight} stroke={ink} strokeWidth="1.5" />
        </svg>
      )
    case 'stamp':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="56" rx="20" ry="3.5" fill={paperShade} />
          <rect x="12" y="42" width="40" height="9" rx="2.5" fill={red} stroke={ink} strokeWidth="2" />
          <rect x="15" y="36" width="34" height="7" rx="2" fill={ochreLight} stroke={ink} strokeWidth="2" />
          <path d="M25 36c0-5 3-7 3-11 0-4-4-6-4-10 0-3.5 3.6-6 8-6s8 2.5 8 6c0 4-4 6-4 10 0 4 3 6 3 11H25Z" fill={ochre} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <path d="M29 14c1.2-1.2 4.8-1.2 6 0" stroke={paper} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="56" rx="21" ry="3.5" fill={paperShade} />
          <rect x="11" y="45" width="42" height="7" rx="3" fill={slate} stroke={ink} strokeWidth="2" />
          <path d="M16 45c0-13 6.5-22 16-22s16 9 16 22H16Z" fill={ochre} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <path d="M23 32c1.5-3.5 4.2-5.5 7-6" stroke={paper} strokeWidth="2.2" strokeLinecap="round" />
          <rect x="28" y="16" width="8" height="7" rx="3" fill={red} stroke={ink} strokeWidth="2" />
          <path d="M12 20l4 2M52 20l-4 2" stroke={red} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'clearanceSlip':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="56" rx="20" ry="3.5" fill={paperShade} />
          <rect x="12" y="10" width="34" height="42" rx="4" fill={paper} stroke={ink} strokeWidth="2" />
          <rect x="17" y="16" width="24" height="5" rx="1.5" fill={ochreLight} stroke={ink} strokeWidth="1.5" />
          <path d="M18 27h20M18 33h15M18 39h12" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="44" cy="42" r="11" fill={slateLight} stroke={ink} strokeWidth="2" />
          <path d="M39 42.2l3.4 3.4 6.6-7" stroke={red} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'emptyTray':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="55" rx="23" ry="3.5" fill={paperShade} />
          <path d="M10 34l6-12h32l6 12v14a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V34Z" fill={ochreLight} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 34h14l3 5h10l3-5h14" fill={paperShade} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <rect x="21" y="14" width="22" height="12" rx="2" fill={paper} stroke={ink} strokeWidth="1.8" />
          <path d="M26 20l3 3 6-6" stroke={red} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}
