export type ChalkGlyphName =
  | 'desk'
  | 'log'
  | 'students'
  | 'inventory'
  | 'overdue'
  | 'clearance'
  | 'dashboard'
  | 'incidents'
  | 'audit'
  | 'analytics'
  | 'settings'
  | 'lock'
  | 'palette'

interface ChalkGlyphProps {
  name: ChalkGlyphName
  size?: number
  className?: string
}

/**
 * Tier 1 — ChalkGlyph (24x24 pixel-aligned duotone nav glyphs)
 * 1.75px rounded ink stroke (`currentColor`) with `--chalk-glyph-fill`
 * and `--chalk-glyph-accent` (#a82c1d red-pen highlights).
 */
export function ChalkGlyph({ name, size = 20, className = '' }: ChalkGlyphProps) {
  const fill = 'var(--chalk-glyph-fill, #e4d5b7)'
  const accent = 'var(--chalk-glyph-accent, #a82c1d)'

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `flex-shrink-0 ${className}`,
    'aria-hidden': true as const
  }

  switch (name) {
    case 'desk':
      return (
        <svg {...common}>
          <rect x="3" y="14" width="18" height="6" rx="2" fill={fill} />
          <path d="M7 14v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" fill={fill} />
          <path d="M10 10V6.5a2 2 0 1 1 4 0V10" />
          <path d="M7 17h4" stroke={accent} strokeWidth={2} />
        </svg>
      )
    case 'log':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2" fill={fill} />
          <path d="M8 3.5v17" />
          <path d="M11 8h5.5" stroke={accent} strokeWidth={2} />
          <path d="M11 12h5.5" />
          <path d="M11 16h3.5" />
        </svg>
      )
    case 'students':
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" fill={fill} />
          <circle cx="11.5" cy="9.5" r="2.2" fill="#fbf8f1" />
          <path d="M8 15.5c.6-1.8 2-2.7 3.5-2.7s2.9.9 3.5 2.7" />
          <path d="M18 7h2v10h-2" stroke={accent} />
        </svg>
      )
    case 'inventory':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="5" rx="1.5" fill={fill} />
          <rect x="5" y="10" width="15" height="5" rx="1.5" fill={fill} />
          <rect x="3.5" y="16" width="16.5" height="5" rx="1.5" fill={fill} />
          <path d="M8 6.5h4" stroke={accent} />
          <path d="M9 12.5h5" />
          <path d="M8 18.5h4" />
        </svg>
      )
    case 'overdue':
      return (
        <svg {...common}>
          <path d="M5 17h14a1 1 0 0 1 1 1v2H4v-2a1 1 0 0 1 1-1Z" fill={fill} />
          <path d="M6.5 17a5.5 5.5 0 0 1 11 0" fill={fill} />
          <path d="M12 7v2" stroke={accent} strokeWidth={2} />
          <circle cx="12" cy="6" r="1.2" fill={accent} stroke="none" />
          <path d="M12 11.5v2.5l1.5 1" stroke={accent} />
        </svg>
      )
    case 'clearance':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="13" height="18" rx="2" fill={fill} />
          <path d="M7.5 8h6M7.5 12h4.5" />
          <circle cx="16.5" cy="16.5" r="4.5" fill="#fbf8f1" stroke={accent} />
          <path d="M14.7 16.6l1.3 1.3 2.5-2.6" stroke={accent} />
        </svg>
      )
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" fill={fill} />
          <rect x="13" y="3.5" width="7.5" height="5.5" rx="1.5" fill={fill} />
          <rect x="13" y="11" width="7.5" height="9.5" rx="1.5" fill={fill} />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" fill={fill} />
          <path d="M6 7.2h2.5" stroke={accent} />
        </svg>
      )
    case 'incidents':
      return (
        <svg {...common}>
          <path d="M12 3.5L21 19.5H3L12 3.5Z" fill={fill} />
          <path d="M12 9.5v4.5" stroke={accent} strokeWidth={2} />
          <circle cx="12" cy="16.7" r="1" fill={accent} stroke="none" />
        </svg>
      )
    case 'audit':
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="15" height="16.5" rx="2" fill={fill} />
          <rect x="8.5" y="2.5" width="7" height="3.5" rx="1" fill="#fbf8f1" />
          <path d="M8 11l1.5 1.5L12.5 9.5" stroke={accent} />
          <path d="M14.5 11.5h2M8 15.5h8.5" />
        </svg>
      )
    case 'analytics':
      return (
        <svg {...common}>
          <path d="M4 19.5h16" />
          <rect x="5.5" y="12.5" width="3.2" height="7" rx="1" fill={fill} />
          <rect x="10.4" y="8.5" width="3.2" height="11" rx="1" fill={fill} />
          <rect x="15.3" y="5" width="3.2" height="14.5" rx="1" fill={fill} />
          <path d="M5.5 9l4.8-3 5-2" stroke={accent} />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" fill={fill} />
          <circle cx="12" cy="12" r="3" fill="#fbf8f1" stroke={accent} />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="10.5" width="14" height="10" rx="2" fill={fill} />
          <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
          <circle cx="12" cy="15.2" r="1.4" fill={accent} stroke="none" />
        </svg>
      )
    case 'palette':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" fill={fill} />
          <circle cx="9" cy="9.5" r="1.3" fill={accent} stroke="none" />
          <circle cx="14.5" cy="9" r="1.3" fill="#2f5749" stroke="none" />
          <circle cx="9.5" cy="14.5" r="1.3" fill="#b4690e" stroke="none" />
        </svg>
      )
  }
}
