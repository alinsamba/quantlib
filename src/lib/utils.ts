import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculates current available book copies in stock ready for circulation.
 *
 * Invariant: Available stock represents physical copies currently on shelves.
 * Formula: Available = max(0, Opening Stock + Recovered - Issued - Damaged - Lost)
 * Clamped to 0 to prevent negative inventory rendering anomalies.
 *
 * @param subject - Stock count metrics for a given subject catalog entry
 * @param subject.openingCount - Baseline physical count at start of academic period (copies)
 * @param subject.recovered - Damaged or lost books returned to circulating pool (copies)
 * @param subject.issued - Active loans currently borrowed by students (copies)
 * @param subject.damaged - Non-circulating damaged copies awaiting repair/write-off (copies)
 * @param subject.lost - Unrecovered lost copies written off from stock (copies)
 * @returns Net count of available physical copies ready for checkout (integer >= 0)
 */
export function calculateAvailable(subject: {
  openingCount: number
  recovered: number
  issued: number
  damaged: number
  lost: number
}): number {
  const net = subject.openingCount + subject.recovered - subject.issued - subject.damaged - subject.lost
  return Math.max(0, net)
}
/**
 * Rounds financial amount to standard two-decimal precision, mitigating floating-point arithmetic errors.
 *
 * @param amount - Raw numeric currency amount
 * @returns Currency amount rounded to 2 decimal places
 */
export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * Validates master password strength against enterprise vault security standards.
 *
 * Requirements:
 * - Minimum 12 characters
 * - At least one lowercase letter [a-z]
 * - At least one uppercase letter [A-Z]
 * - At least one numerical digit [0-9]
 * - At least one special symbol [!@#$%^&*()_+-=[]{};':"\\|,.<>/?]
 *
 * @param password - Candidate master vault password string
 * @returns Error message string if invalid, or empty string if valid
 */
export function validateMasterPassword(password: string): string {
  if (password.length < 12) {
    return 'Password must be at least 12 characters long'
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter'
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter'
  }

  if (!/\d/.test(password)) {
    return 'Password must include at least one number'
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must include at least one special character'
  }

  return ''
}

export const IncidentType = {
  DAMAGED: 'DAMAGED',
  LOST: 'LOST',
  NEW: 'NEW',
  RECOVERED: 'RECOVERED',
  DONATION: 'DONATION'
} as const

export type IncidentType = typeof IncidentType[keyof typeof IncidentType]

export const UserRole = {
  LIBRARIAN: 'LIBRARIAN',
  ADMIN: 'ADMIN'
} as const

export type UserRole = typeof UserRole[keyof typeof UserRole]
