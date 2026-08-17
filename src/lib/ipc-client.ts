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
  DashboardSummary
} from './types'

type ElectronAPI = Window['electronAPI']

async function invoke<T>(
  method: keyof ElectronAPI,
  ...args: unknown[]
): Promise<T> {
  if (!window.electronAPI) {
    throw new Error('Electron preload is not available. Restart the desktop app with npm run dev.')
  }
  const fn = window.electronAPI[method] as (...a: unknown[]) => Promise<{ success?: boolean; error?: string; data?: T }>
  const res = await fn(...args)
  if (res && res.success === false) throw new Error(res.error || 'IPC call failed')
  return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T
}

function direct<T>(
  method: keyof ElectronAPI,
  ...args: unknown[]
): Promise<T> {
  if (!window.electronAPI) {
    return Promise.reject(new Error('Electron preload is not available.'))
  }
  const fn = window.electronAPI[method] as (...a: unknown[]) => Promise<T>
  return fn(...args)
}

export const db = {
  getSubjects: () => invoke<Subject[]>('getSubjects'),
  getIncidents: () => invoke<Incident[]>('getIncidents'),
  getSummary: () => invoke<DashboardSummary>('getSummary'),
  addSubject: (data: Omit<Subject, 'id' | 'createdAt' | 'updatedAt'> | Partial<Subject>) => invoke<Subject>('addSubject', data),
  addIncident: (data: {
    type: string
    date?: string
    subjectId?: number | null
    bookTitle: string
    condition?: string
    comment?: string
    reportedBy?: string
    responsibleParty?: string
    studentClass?: string
    actionTaken?: string
  } | Partial<Incident>) => invoke<Incident>('addIncident', data),
  updateSubject: (id: number, data: Partial<Subject>) => invoke<Subject>('updateSubject', { id, data }),
  setTheme: (mode: 'light' | 'dark') => invoke<void>('setTheme', mode),
  addCheckout: (data: {
    subjectId: number
    studentName: string
    studentClass?: string | null
    dueDate?: string
    conditionOut?: number
  }) => invoke<Checkout>('addCheckout', data),
  returnCheckout: (id: number, conditionIn: number) => invoke<Checkout>('returnCheckout', { id, conditionIn }),
  getActiveCheckouts: (subjectId?: number) => invoke<Checkout[]>('getActiveCheckouts', subjectId),
  recordFinePayment: (data: { studentName: string; studentClass?: string; amount: number; paymentMethod: string; notes?: string }) => direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('recordFinePayment', data),
  waiveFine: (data: { studentName: string; studentClass?: string; reason: string; approvedBy?: string }) => direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('waiveFine', data),
  getOverdueCheckouts: () => invoke<Checkout[]>('getOverdueCheckouts'),
  getAuditLogs: () => invoke<AuditLog[]>('getAuditLogs'),

  checkDbStatus: () => direct<'SETUP' | 'LOCKED'>('checkDbStatus'),
  setupDb: (password: string) => direct<{ success: boolean; recoveryKey?: string; error?: string }>('setupDb', password),
  unlockDb: (args: { password?: string; isRecovery?: boolean }) => direct<{ success: boolean; error?: string }>('unlockDb', args),
  changePassword: (args: { oldPassword?: string; newPassword?: string }) => direct<{ success: boolean; recoveryKey?: string; error?: string }>('changePassword', args),
  backupDatabase: () => direct<{ success: boolean; error?: string }>('backupDatabase'),
  getBorrowingRules: () => invoke<BorrowingRule[]>('getBorrowingRules'),
  saveBorrowingRule: (data: Partial<BorrowingRule>) => invoke<BorrowingRule>('saveBorrowingRule', data),
  deleteBorrowingRule: (id: number) => invoke<void>('deleteBorrowingRule', id),
  getClearanceStatus: (data: { studentName: string; studentClass?: string }) => direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('getClearanceStatus', data),
  generateClearanceSlip: (data: { studentName: string; studentClass?: string }) => direct<{ success: boolean; data?: ClearanceRecord; error?: string }>('generateClearanceSlip', data),
  createStockAudit: (data?: { auditedBy?: string; notes?: string }) => invoke<StockAudit>('createStockAudit', data),
  saveStockAuditItem: (data: { auditId: number; subjectId: number; actualCount: number; notes?: string }) => invoke<StockAuditItem>('saveStockAuditItem', data),
  completeStockAudit: (data: { auditId: number; notes?: string }) => invoke<StockAudit>('completeStockAudit', data),
  getStockAudits: (id?: number) => invoke<StockAudit[]>('getStockAudits', id),
  getDepreciationAnalytics: () => invoke<DepreciationAnalytics>('getDepreciationAnalytics'),
  getCirculationInsights: () => invoke<CirculationInsights>('getCirculationInsights'),
  getBackupConfig: () => direct<{ success: boolean; data?: BackupConfig; error?: string }>('getBackupConfig'),
  saveBackupConfig: (data: Partial<BackupConfig>) => direct<{ success: boolean; error?: string }>('saveBackupConfig', data),
  triggerAutoBackup: (customPath?: string) => direct<{ success: boolean; backupPath?: string; filename?: string; error?: string }>('triggerAutoBackup', customPath),
  listBackups: () => direct<{ success: boolean; data?: BackupFileRecord[]; error?: string }>('listBackups'),
  getLanSyncConfig: () => direct<{ success: boolean; data?: LanSyncConfig; error?: string }>('getLanSyncConfig'),
  saveLanSyncConfig: (data: Partial<LanSyncConfig>) => direct<{ success: boolean; error?: string }>('saveLanSyncConfig', data),
  syncWithLanPeer: (data: { peerIp: string; peerPort?: number; passcode?: string }) => direct<{ success: boolean; data?: LanSyncResult; error?: string }>('syncWithLanPeer', data),
  getLanStatus: () => direct<{ success: boolean; data?: LanStatusResponse; error?: string }>('getLanStatus'),
  exportEntireDbCsv: () => direct<{ success: boolean; data?: DatabaseExportResult; error?: string }>('exportEntireDbCsv')
}
