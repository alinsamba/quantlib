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
  SchoolInfo,
  Student,
  StudentInput,
  PromoteStudentsResult
} from './types'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  recoveryKey?: string
  backupPath?: string
  filename?: string
}

function ensureTauriRuntime(): void {
  if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__ && !import.meta.env.VITEST) {
    throw new Error('QuantLib desktop backend is not connected. Please launch QuantLib via Tauri (`npm run tauri:dev`).')
  }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  ensureTauriRuntime()
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
  ensureTauriRuntime()
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
  resolveIncident: (data: { id: number; resolutionNotes?: string }) =>
    invoke<Incident>('resolve_incident', data),
  updateSubject: (id: number, data: Partial<Subject>) =>
    invoke<Subject>('update_subject', { id, data }),
  deleteSubject: (id: number) =>
    invoke<void>('delete_subject', { id }),
  setTheme: (mode: 'light' | 'dark') =>
    invoke<void>('set_theme', { mode }),
  addCheckout: (data: {
    subjectId: number
    studentName: string
    studentClass?: string | null
    dueDate?: string
    conditionOut?: number
    bookNote?: string | null
  }) =>
    invoke<Checkout>('add_checkout', {
      subjectId: data.subjectId,
      studentName: data.studentName,
      studentClass: data.studentClass,
      dueDate: data.dueDate,
      conditionOut: data.conditionOut,
      ...(data.bookNote !== undefined ? { bookNote: data.bookNote } : {})
    }),
  returnCheckout: (id: number, conditionIn: number) =>
    invoke<Checkout>('return_checkout', { id, conditionIn }),
  renewCheckout: (data: { id: number; extraDays?: number; newDueDate?: string }) =>
    invoke<Checkout>('renew_checkout', {
      id: data.id,
      extraDays: data.extraDays,
      newDueDate: data.newDueDate
    }),
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
  lockDb: () => direct<{ success: boolean; error?: string }>('lock_db'),
  changePassword: (args: { oldPassword?: string; newPassword?: string }) =>
    direct<{ success: boolean; recoveryKey?: string; error?: string }>('change_password', args),
  backupDatabase: () => direct<{ success: boolean; backupPath?: string; filename?: string; error?: string }>('backup_database'),
  getBorrowingRules: () => invoke<BorrowingRule[]>('get_borrowing_rules'),
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
  getDepreciationAnalytics: () => invoke<DepreciationAnalytics>('get_depreciation_analytics'),
  getCirculationInsights: () => invoke<CirculationInsights>('get_circulation_insights'),
  getBackupConfig: () => direct<{ success: boolean; data?: BackupConfig; error?: string }>('get_backup_config'),
  saveBackupConfig: (data: Partial<BackupConfig>) =>
    direct<{ success: boolean; data?: BackupConfig; error?: string }>('save_backup_config', { data }),
  triggerAutoBackup: (customPath?: string) =>
    direct<{ success: boolean; backupPath?: string; filename?: string; error?: string }>('trigger_auto_backup', { customPath }),
  listBackups: () => direct<{ success: boolean; data?: BackupFileRecord[]; error?: string }>('list_backups'),
  restoreBackup: (backupPath: string) =>
    direct<{ success: boolean; error?: string }>('restore_backup', { backupPath }),
  getLanSyncConfig: () => direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('get_lan_sync_config'),
  saveLanSyncConfig: (data: Partial<LanSyncConfig>) =>
    direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('save_lan_sync_config', { data }),
  syncWithLanPeer: (data: { peerIp: string; peerPort?: number; passcode?: string }) =>
    direct<{ success: boolean; data?: LanSyncResult; error?: string }>('sync_with_lan_peer_cmd', data),
  getLanStatus: () => direct<{ success: boolean; data?: LanStatusResponse; error?: string }>('get_lan_status'),
  exportEntireDbCsv: () => direct<{ success: boolean; data?: DatabaseExportResult; error?: string }>('export_entire_db_csv'),
  getSchoolInfo: () => invoke<SchoolInfo>('get_school_info'),
  saveSchoolInfo: (data: SchoolInfo) => invoke<SchoolInfo>('save_school_info', { data }),
  getStudents: () => invoke<Student[]>('get_students'),
  addStudent: (data: StudentInput) => invoke<Student>('add_student', { data }),
  updateStudent: (id: number, data: StudentInput) => invoke<Student>('update_student', { id, data }),
  deleteStudent: (id: number) => invoke<void>('delete_student', { id }),
  promoteStudents: (options: { graduateS4: boolean; graduateS6: boolean }) =>
    invoke<PromoteStudentsResult>('promote_students', {
      graduateS4: options.graduateS4,
      graduateS6: options.graduateS6
    })
}
