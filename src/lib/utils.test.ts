import { describe, it, expect } from 'vitest'
import { calculateAvailable, validateMasterPassword, IncidentType, roundCurrency } from './utils'

describe('Domain Utils Tests', () => {
  it('calculates available inventory correctly', () => {
    const subject = {
      openingCount: 10,
      recovered: 2,
      issued: 3,
      damaged: 1,
      lost: 1
    }
    // available = 10 + 2 - 3 - 1 - 1 = 7
    expect(calculateAvailable(subject)).toBe(7)
  })

  it('clamps available inventory to zero when loans exceed stock', () => {
    const subject = {
      openingCount: 2,
      recovered: 0,
      issued: 5,
      damaged: 0,
      lost: 0
    }
    expect(calculateAvailable(subject)).toBe(0)
  })

  it('validates master password length, complexity, and special character constraints', () => {
    expect(validateMasterPassword('')).toContain('at least 12 characters')
    expect(validateMasterPassword('Short1!')).toContain('at least 12 characters')
    expect(validateMasterPassword('alllowercase123!')).toContain('uppercase letter')
    expect(validateMasterPassword('ALLUPPERCASE123!')).toContain('lowercase letter')
    expect(validateMasterPassword('NoNumbersHere!!')).toContain('number')
    expect(validateMasterPassword('NoSpecialChar123')).toContain('special character')
    expect(validateMasterPassword('ValidMasterPass123!')).toBe('')
  })

  it('contains expected incident types', () => {
    expect(Object.values(IncidentType)).toContain('DAMAGED')
    expect(Object.values(IncidentType)).toContain('LOST')
    expect(Object.values(IncidentType)).toContain('RECOVERED')
    expect(Object.values(IncidentType)).toContain('NEW')
    expect(Object.values(IncidentType)).toContain('DONATION')
  })

  it('rounds financial numbers to two decimal places', () => {
    expect(roundCurrency(14.9999999)).toBe(15)
    expect(roundCurrency(12.345)).toBe(12.35)
    expect(roundCurrency(10.1)).toBe(10.1)
    expect(roundCurrency(0.004)).toBe(0)
    expect(roundCurrency(0)).toBe(0)
  })
})
