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
  DatabaseExportResult
} from './types'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  recoveryKey?: string
  backupPath?: string
  filename?: string
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const res = await tauriInvoke<ApiResponse<T>>(command, args)
  if (res && res.success === false) {
    throw new Error(res.error || 'Operation failed')
  }
  return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T
}

async function direct<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return await tauriInvoke<T>(command, args)
}

export const db = {
  getSubjects: () => invoke<Subject[]>('get_subjects'),
  getIncidents: () => invoke<Incident[]>('get_incidents'),
  getSummary: () => invoke<DashboardSummary>('get_summary'),
  addSubject: (data: Omit<Subject, 'id' | 'createdAt' | 'updatedAt'> | Partial<Subject>) =>
    invoke<Subject>('add_subject', { data }),
  addIncident: (data: Partial<Incident>) =>
    invoke<Incident>('add_incident', { data }),
  updateSubject: (id: number, data: Partial<Subject>) =>
    invoke<Subject>('update_subject', { id, data }),
  setTheme: (mode: 'light' | 'dark') =>
    invoke<void>('set_theme', { mode }),
  addCheckout: (data: {
    subjectId: number
    studentName: string
    studentClass?: string | null
    dueDate?: string
    conditionOut?: number
  }) =>
    invoke<Checkout>('add_checkout', {
      subjectId: data.subjectId,
      studentName: data.studentName,
      studentClass: data.studentClass,
      dueDate: data.dueDate,
      conditionOut: data.conditionOut
    }),
  returnCheckout: (id: number, conditionIn: number) =>
    invoke<Checkout>('return_checkout', { id, conditionIn }),
  getActiveCheckouts: (subjectId?: number) =>
    invoke<Checkout[]>('get_active_checkouts', { subjectId }),
  recordFinePayment: (data: { studentName: string; studentClass?: string; amount: number; paymentMethod: string; notes?: string }) =>
    direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('record_fine_payment', data),
  waiveFine: (data: { studentName: string; studentClass?: string; reason: string; approvedBy?: string }) =>
    direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('waive_fine', data),
  getOverdueCheckouts: () => invoke<Checkout[]>('get_overdue_checkouts'),
  getAuditLogs: () => invoke<AuditLog[]>('get_audit_logs'),

  checkDbStatus: () => direct<'SETUP' | 'LOCKED'>('check_db_status'),
  setupDb: (password: string) =>
    direct<{ success: boolean; recoveryKey?: string; error?: string }>('setup_db', { password }),
  unlockDb: (args: { password?: string; isRecovery?: boolean }) =>
    direct<{ success: boolean; error?: string }>('unlock_db', args),
  changePassword: (args: { oldPassword?: string; newPassword?: string }) =>
    direct<{ success: boolean; recoveryKey?: string; error?: string }>('change_password', args),
  backupDatabase: () =>
    direct<{ success: boolean; error?: string }>('backup_database'),
  getBorrowingRules: () =>
    invoke<BorrowingRule[]>('get_borrowing_rules'),
  saveBorrowingRule: (data: Partial<BorrowingRule>) =>
    invoke<BorrowingRule>('save_borrowing_rule', { data }),
  deleteBorrowingRule: (id: number) =>
    invoke<void>('delete_borrowing_rule', { id }),
  getClearanceStatus: (data: { studentName: string; studentClass?: string }) =>
    direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('get_clearance_status', data),
  generateClearanceSlip: (data: { studentName: string; studentClass?: string }) =>
    direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('generate_clearance_slip', data),
  createStockAudit: (data?: { auditedBy?: string; notes?: string }) =>
    invoke<StockAudit>('create_stock_audit', data),
  saveStockAuditItem: (data: { auditId: number; subjectId: number; actualCount: number; notes?: string }) =>
    invoke<StockAuditItem>('save_stock_audit_item', data),
  completeStockAudit: (data: { auditId: number; notes?: string }) =>
    invoke<StockAudit>('complete_stock_audit', data),
  getStockAudits: (id?: number) =>
    invoke<StockAudit[]>('get_stock_audits', { id }),
  getDepreciationAnalytics: () =>
    invoke<DepreciationAnalytics>('get_depreciation_analytics'),
  getCirculationInsights: () =>
    invoke<CirculationInsights>('get_circulation_insights'),
  getBackupConfig: () =>
    direct<{ success: boolean; data?: BackupConfig; error?: string }>('get_backup_config'),
  saveBackupConfig: (data: Partial<BackupConfig>) =>
    direct<{ success: boolean; data?: BackupConfig; error?: string }>('save_backup_config', { data }),
  triggerAutoBackup: (customPath?: string) =>
    direct<{ success: boolean; backupPath?: string; filename?: string; error?: string }>('trigger_auto_backup', { customPath }),
  listBackups: () =>
    direct<{ success: boolean; data?: BackupFileRecord[]; error?: string }>('list_backups'),
  getLanSyncConfig: () =>
    direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('get_lan_sync_config'),
  saveLanSyncConfig: (data: Partial<LanSyncConfig>) =>
    direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('save_lan_sync_config', { data }),
  syncWithLanPeer: (data: { peerIp: string; peerPort?: number; passcode?: string }) =>
    direct<{ success: boolean; data?: LanSyncResult; error?: string }>('sync_with_lan_peer_cmd', data),
  getLanStatus: () =>
    direct<{ success: boolean; data?: LanStatusResponse; error?: string }>('get_lan_status'),
  exportEntireDbCsv: () =>
    direct<{ success: boolean; data?: DatabaseExportResult; error?: string }>('export_entire_db_csv')
}
