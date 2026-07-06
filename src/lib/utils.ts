import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAvailable(subject: {
  openingCount: number
  recovered: number
  issued: number
  damaged: number
  lost: number
}) {
  return subject.openingCount + subject.recovered - subject.issued - subject.damaged - subject.lost
}

export function validateMasterPassword(password: string) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long'
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include uppercase, lowercase, and number characters'
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
