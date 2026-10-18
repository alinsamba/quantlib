import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type {
  Subject,
  Incident,
  AuditLog,
  Checkout,
  BorrowingRule,
  ClearanceRecord,
  StockAudit,
  StockAuditItem,
  DepreciationAnalytics,
  CirculationInsights,
  BackupConfig,
  BackupFileRecord,
  LanSyncConfig,
  LanStatusResponse,
  LanSyncResult,
  DashboardSummary,
  DatabaseExportResult,
  SchoolInfo
} from './types'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  recoveryKey?: string
  backupPath?: string
  filename?: string
}

type ElectronAPI = Window['electronAPI']

async function invokeElectron<T>(
  method: keyof NonNullable<ElectronAPI>,
  ...args: unknown[]
): Promise<T> {
  const api = window.electronAPI
  if (!api) throw new Error('Electron preload is not available.')
  const fn = api[method] as (...a: unknown[]) => Promise<{ success?: boolean; error?: string; data?: T }>
  const res = await fn(...args)
  if (res && res.success === false) throw new Error(res.error || 'IPC call failed')
  return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T
}

function directElectron<T>(
  method: keyof NonNullable<ElectronAPI>,
  ...args: unknown[]
): Promise<T> {
  const api = window.electronAPI
  if (!api) return Promise.reject(new Error('Electron preload is not available.'))
  const fn = api[method] as (...a: unknown[]) => Promise<T>
  return fn(...args)
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const res = await tauriInvoke<ApiResponse<T>>(command, args)
  if (res && res.success === false) {
    throw new Error(res.error || 'Operation failed')
  }
  if (res && typeof res === 'object') {
    if ('data' in res) {
      return res.data as T
    }
    if ('success' in res) {
      return undefined as T
    }
  }
  return res as T
}

async function direct<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return await tauriInvoke<T>(command, args)
}

export const db = {
  getSubjects: () =>
    isElectron() ? invokeElectron<Subject[]>('getSubjects') : invoke<Subject[]>('get_subjects'),
  getIncidents: () =>
    isElectron() ? invokeElectron<Incident[]>('getIncidents') : invoke<Incident[]>('get_incidents'),
  getSummary: () =>
    isElectron() ? invokeElectron<DashboardSummary>('getSummary') : invoke<DashboardSummary>('get_summary'),
  addSubject: (data: Omit<Subject, 'id' | 'createdAt' | 'updatedAt'> | Partial<Subject>) =>
    isElectron() ? invokeElectron<Subject>('addSubject', data) : invoke<Subject>('add_subject', { data }),
  addIncident: (data: Partial<Incident>) =>
    isElectron() ? invokeElectron<Incident>('addIncident', data) : invoke<Incident>('add_incident', { data }),
  updateSubject: (id: number, data: Partial<Subject>) =>
    isElectron() ? invokeElectron<Subject>('updateSubject', { id, data }) : invoke<Subject>('update_subject', { id, data }),
  setTheme: (mode: 'light' | 'dark') =>
    isElectron() ? invokeElectron<void>('setTheme', mode) : invoke<void>('set_theme', { mode }),
  addCheckout: (data: {
    subjectId: number
    studentName: string
    studentClass?: string | null
    dueDate?: string
    conditionOut?: number
  }) =>
    isElectron()
      ? invokeElectron<Checkout>('addCheckout', data)
      : invoke<Checkout>('add_checkout', {
          subjectId: data.subjectId,
          studentName: data.studentName,
          studentClass: data.studentClass,
          dueDate: data.dueDate,
          conditionOut: data.conditionOut
        }),
  returnCheckout: (id: number, conditionIn: number) =>
    isElectron()
      ? invokeElectron<Checkout>('returnCheckout', { id, conditionIn })
      : invoke<Checkout>('return_checkout', { id, conditionIn }),
  getActiveCheckouts: (subjectId?: number) =>
    isElectron() ? invokeElectron<Checkout[]>('getActiveCheckouts', subjectId) : invoke<Checkout[]>('get_active_checkouts', { subjectId }),
  recordFinePayment: (data: { studentName: string; studentClass?: string; amount: number; paymentMethod: string; notes?: string }) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: ClearanceRecord; error?: string }>('recordFinePayment', data)
      : direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('record_fine_payment', data),
  waiveFine: (data: { studentName: string; studentClass?: string; reason: string; approvedBy?: string }) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: ClearanceRecord; error?: string }>('waiveFine', data)
      : direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('waive_fine', data),
  getOverdueCheckouts: () =>
    isElectron() ? invokeElectron<Checkout[]>('getOverdueCheckouts') : invoke<Checkout[]>('get_overdue_checkouts'),
  getAuditLogs: () =>
    isElectron() ? invokeElectron<AuditLog[]>('getAuditLogs') : invoke<AuditLog[]>('get_audit_logs'),

  checkDbStatus: () =>
    isElectron() ? directElectron<'SETUP' | 'LOCKED'>('checkDbStatus') : direct<'SETUP' | 'LOCKED'>('check_db_status'),
  setupDb: (password: string) =>
    isElectron()
      ? directElectron<{ success: boolean; recoveryKey?: string; error?: string }>('setupDb', password)
      : direct<{ success: boolean; recoveryKey?: string; error?: string }>('setup_db', { password }),
  unlockDb: (args: { password?: string; isRecovery?: boolean }) =>
    isElectron()
      ? directElectron<{ success: boolean; error?: string }>('unlockDb', args)
      : direct<{ success: boolean; error?: string }>('unlock_db', args),
  changePassword: (args: { oldPassword?: string; newPassword?: string }) =>
    isElectron()
      ? directElectron<{ success: boolean; recoveryKey?: string; error?: string }>('changePassword', args)
      : direct<{ success: boolean; recoveryKey?: string; error?: string }>('change_password', args),
  backupDatabase: () =>
    isElectron()
      ? directElectron<{ success: boolean; error?: string }>('backupDatabase')
      : direct<{ success: boolean; error?: string }>('backup_database'),
  getBorrowingRules: () =>
    isElectron() ? invokeElectron<BorrowingRule[]>('getBorrowingRules') : invoke<BorrowingRule[]>('get_borrowing_rules'),
  saveBorrowingRule: (data: Partial<BorrowingRule>) =>
    isElectron() ? invokeElectron<BorrowingRule>('saveBorrowingRule', data) : invoke<BorrowingRule>('save_borrowing_rule', { data }),
  deleteBorrowingRule: (id: number) =>
    isElectron() ? invokeElectron<void>('deleteBorrowingRule', id) : invoke<void>('delete_borrowing_rule', { id }),
  getClearanceStatus: (data: { studentName: string; studentClass?: string }) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: ClearanceRecord; error?: string }>('getClearanceStatus', data)
      : direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('get_clearance_status', data),
  generateClearanceSlip: (data: { studentName: string; studentClass?: string }) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: ClearanceRecord; error?: string }>('generateClearanceSlip', data)
      : direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('generate_clearance_slip', data),
  createStockAudit: (data?: { auditedBy?: string; notes?: string }) =>
    isElectron() ? invokeElectron<StockAudit>('createStockAudit', data) : invoke<StockAudit>('create_stock_audit', data),
  saveStockAuditItem: (data: { auditId: number; subjectId: number; actualCount: number; notes?: string }) =>
    isElectron() ? invokeElectron<StockAuditItem>('saveStockAuditItem', data) : invoke<StockAuditItem>('save_stock_audit_item', data),
  completeStockAudit: (data: { auditId: number; notes?: string }) =>
    isElectron() ? invokeElectron<StockAudit>('completeStockAudit', data) : invoke<StockAudit>('complete_stock_audit', data),
  getStockAudits: (id?: number) =>
    isElectron() ? invokeElectron<StockAudit[]>('getStockAudits', id) : invoke<StockAudit[]>('get_stock_audits', { id }),
  getDepreciationAnalytics: () =>
    isElectron() ? invokeElectron<DepreciationAnalytics>('getDepreciationAnalytics') : invoke<DepreciationAnalytics>('get_depreciation_analytics'),
  getCirculationInsights: () =>
    isElectron() ? invokeElectron<CirculationInsights>('getCirculationInsights') : invoke<CirculationInsights>('get_circulation_insights'),
  getBackupConfig: () =>
    isElectron()
      ? directElectron<{ success: boolean; data?: BackupConfig; error?: string }>('getBackupConfig')
      : direct<{ success: boolean; data?: BackupConfig; error?: string }>('get_backup_config'),
  saveBackupConfig: (data: Partial<BackupConfig>) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: BackupConfig; error?: string }>('saveBackupConfig', data)
      : direct<{ success: boolean; data?: BackupConfig; error?: string }>('save_backup_config', { data }),
  triggerAutoBackup: (customPath?: string) =>
    isElectron()
      ? directElectron<{ success: boolean; backupPath?: string; filename?: string; error?: string }>('triggerAutoBackup', customPath)
      : direct<{ success: boolean; backupPath?: string; filename?: string; error?: string }>('trigger_auto_backup', { customPath }),
  listBackups: () =>
    isElectron()
      ? directElectron<{ success: boolean; data?: BackupFileRecord[]; error?: string }>('listBackups')
      : direct<{ success: boolean; data?: BackupFileRecord[]; error?: string }>('list_backups'),
  getLanSyncConfig: () =>
    isElectron()
      ? directElectron<{ success: boolean; data?: LanSyncConfig; error?: string }>('getLanSyncConfig')
      : direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('get_lan_sync_config'),
  saveLanSyncConfig: (data: Partial<LanSyncConfig>) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: LanSyncConfig; error?: string }>('saveLanSyncConfig', data)
      : direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('save_lan_sync_config', { data }),
  syncWithLanPeer: (data: { peerIp: string; peerPort?: number; passcode?: string }) =>
    isElectron()
      ? directElectron<{ success: boolean; data?: LanSyncResult; error?: string }>('syncWithLanPeer', data)
      : direct<{ success: boolean; data?: LanSyncResult; error?: string }>('sync_with_lan_peer_cmd', data),
  getLanStatus: () =>
    isElectron()
      ? directElectron<{ success: boolean; data?: LanStatusResponse; error?: string }>('getLanStatus')
      : direct<{ success: boolean; data?: LanStatusResponse; error?: string }>('get_lan_status'),
  exportEntireDbCsv: () =>
    isElectron()
      ? directElectron<{ success: boolean; data?: DatabaseExportResult; error?: string }>('exportEntireDbCsv')
      : direct<{ success: boolean; data?: DatabaseExportResult; error?: string }>('export_entire_db_csv'),
  getSchoolInfo: () =>
    isElectron() ? invokeElectron<SchoolInfo>('getSchoolInfo') : invoke<SchoolInfo>('get_school_info'),
  saveSchoolInfo: (data: SchoolInfo) =>
    isElectron() ? invokeElectron<SchoolInfo>('saveSchoolInfo', data) : invoke<SchoolInfo>('save_school_info', { data })
}
