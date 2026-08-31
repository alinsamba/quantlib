import * as XLSX from 'xlsx';

/**
 * Sanitizes cell values against CSV / Spreadsheet Formula Injection (CWE-1236).
 * If a string begins with =, +, -, @, \t, \r, or |, it prefixes the value with an apostrophe (').
 */
export function sanitizeCellValue(val: unknown): unknown {
  if (typeof val === 'string' && /^[\=\+\-\@\t\r\|]/.test(val)) {
    return "'" + val
  }
  return val
}

/**
 * Sanitizes all string fields in a dataset record before spreadsheet export.
 */
export function sanitizeExportRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    sanitized[key] = sanitizeCellValue(value)
  }
  return sanitized
}

/**
 * Exports an array of objects to an Excel (.xlsx) file with formula injection protection.
 */
export function exportToExcel(data: Record<string, unknown>[], fileName: string) {
  const safeData = data.map(sanitizeExportRecord)
  const worksheet = XLSX.utils.json_to_sheet(safeData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

/**
 * Exports an array of objects to a CSV (.csv) file with formula injection protection.
 */
export function exportToCsv(data: Record<string, unknown>[], fileName: string) {
  const safeData = data.map(sanitizeExportRecord)
  const worksheet = XLSX.utils.json_to_sheet(safeData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
  XLSX.writeFile(workbook, `${fileName}.csv`)
}
