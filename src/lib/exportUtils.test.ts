import { describe, it, expect } from 'vitest'
import { sanitizeCellValue, sanitizeExportRecord } from './exportUtils'

describe('Spreadsheet Export Security Tests (CWE-1236)', () => {
  it('neutralizes formula injection characters with leading apostrophe', () => {
    expect(sanitizeCellValue('=cmd|\'/C calc\'!A0')).toBe('\'=cmd|\'/C calc\'!A0')
    expect(sanitizeCellValue('+123456789')).toBe('\'+123456789')
    expect(sanitizeCellValue('-SUM(A1:A10)')).toBe('\'-SUM(A1:A10)')
    expect(sanitizeCellValue('@SUM(A1:A10)')).toBe('\'@SUM(A1:A10)')
    expect(sanitizeCellValue('\tTabIndented')).toBe('\'\tTabIndented')
    expect(sanitizeCellValue('\rCarriageReturn')).toBe('\'\rCarriageReturn')
    expect(sanitizeCellValue('|PipeCommand')).toBe('\'|PipeCommand')
  })

  it('leaves benign strings and non-string types untouched', () => {
    expect(sanitizeCellValue('Mathematics Grade 10')).toBe('Mathematics Grade 10')
    expect(sanitizeCellValue('John Doe')).toBe('John Doe')
    expect(sanitizeCellValue(100)).toBe(100)
    expect(sanitizeCellValue(null)).toBe(null)
    expect(sanitizeCellValue(undefined)).toBe(undefined)
    expect(sanitizeCellValue(true)).toBe(true)
  })

  it('sanitizes nested record fields', () => {
    const record = {
      title: '=HYPERLINK("http://evil.com")',
      student: 'Normal Student',
      comment: '+DangerousFormula',
      count: 42
    }
    const clean = sanitizeExportRecord(record)
    expect(clean.title).toBe('\'=HYPERLINK("http://evil.com")')
    expect(clean.student).toBe('Normal Student')
    expect(clean.comment).toBe('\'+DangerousFormula')
    expect(clean.count).toBe(42)
  })
})
