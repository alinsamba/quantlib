import type {
  Subject,
  Incident,
  AuditLog,
  Checkout,
  BorrowingRule,
  ClearanceRecord,
  StockAudit,
  DepreciationAnalytics,
  CirculationInsights,
  BackupConfig,
  BackupFileRecord,
  LanSyncConfig,
  LanStatusResponse,
  LanSyncResult
} from './lib/types'

export {}

declare global {
  interface Window {
    electronAPI: {
      getSubjects: () => Promise<{ success: boolean; data?: Subject[]; error?: string }>
      getIncidents: () => Promise<{ success: boolean; data?: Incident[]; error?: string }>
      getSummary: () => Promise<{
        success: boolean
        data?: {
          totalBooks: number
          available: number
          issued: number
          damagedLost: number
          subjects: Subject[]
          overdueCount: number
        }
        error?: string
      }>
      addSubject: (data: { name: string; category?: string; openingCount?: number }) => Promise<{ success: boolean; data?: Subject; error?: string }>
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
      }) => Promise<{ success: boolean; data?: Incident; error?: string }>
      updateSubject: (args: { id: number; data: Partial<Subject> }) => Promise<{ success: boolean; data?: Subject; error?: string }>
      setTheme: (mode: 'light' | 'dark') => Promise<{ success: boolean; data?: unknown; error?: string }>
      getClearanceStatus: (data: { studentName: string; studentClass?: string }) => Promise<{
        success: boolean
        data?: {
          studentName: string
          studentClass: string | null
          status: 'CLEARED' | 'HOLD'
          activeCheckouts: Checkout[]
          incidents: Incident[]
          unresolvedIncidents: Incident[]
          totalReplacementCharges: number
        }
        error?: string
      }>
      generateClearanceSlip: (data: { studentName: string; studentClass?: string }) => Promise<{ success: boolean; data?: ClearanceRecord; error?: string }>
      addCheckout: (data: {
        subjectId: number
        studentName: string
        studentClass?: string
        dueDate?: string
        conditionOut?: number
      }) => Promise<{ success: boolean; data?: Checkout; error?: string }>
      returnCheckout: (args: { id: number; conditionIn?: number }) => Promise<{ success: boolean; data?: Checkout; error?: string }>
      getOverdueCheckouts: () => Promise<{ success: boolean; data?: Checkout[]; error?: string }>
      getAuditLogs: () => Promise<{ success: boolean; data?: AuditLog[]; error?: string }>
      checkDbStatus: () => Promise<'SETUP' | 'LOCKED'>
      setupDb: (password: string) => Promise<{ success: boolean; recoveryKey?: string; error?: string }>
      unlockDb: (args: { password?: string; isRecovery?: boolean }) => Promise<{ success: boolean; error?: string }>
      changePassword: (args: { oldPassword?: string; newPassword?: string }) => Promise<{ success: boolean; recoveryKey?: string; error?: string }>
      backupDatabase: () => Promise<{ success: boolean; error?: string }>
      getBorrowingRules: () => Promise<{ success: boolean; data?: BorrowingRule[]; error?: string }>
      saveBorrowingRule: (data: Partial<BorrowingRule>) => Promise<{ success: boolean; data?: BorrowingRule; error?: string }>
      deleteBorrowingRule: (id: number) => Promise<{ success: boolean; data?: unknown; error?: string }>
      getClearanceStatus: (data: { studentName: string; studentClass?: string }) => Promise<{ success: boolean; data?: ClearanceRecord; error?: string }>
      generateClearanceSlip: (data: { studentName: string; studentClass?: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>
      createStockAudit: (data?: { auditedBy?: string; notes?: string }) => Promise<{ success: boolean; data?: StockAudit; error?: string }>
      saveStockAuditItem: (data: { auditId: number; subjectId: number; actualCount: number; notes?: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>
      completeStockAudit: (data: { auditId: number; notes?: string }) => Promise<{ success: boolean; data?: StockAudit; error?: string }>
      getStockAudits: (id?: number) => Promise<{ success: boolean; data?: StockAudit | StockAudit[]; error?: string }>
      getDepreciationAnalytics: () => Promise<{ success: boolean; data?: DepreciationAnalytics; error?: string }>
      getCirculationInsights: () => Promise<{ success: boolean; data?: CirculationInsights; error?: string }>
      getBackupConfig: () => Promise<{ success: boolean; data?: BackupConfig; error?: string }>
      saveBackupConfig: (data: Partial<BackupConfig>) => Promise<{ success: boolean; data?: unknown; error?: string }>
      triggerAutoBackup: (customPath?: string) => Promise<{ success: boolean; backupPath?: string; filename?: string; error?: string }>
      listBackups: () => Promise<{ success: boolean; data?: BackupFileRecord[]; error?: string }>
      getLanSyncConfig: () => Promise<{ success: boolean; data?: LanSyncConfig; error?: string }>
      saveLanSyncConfig: (data: Partial<LanSyncConfig>) => Promise<{ success: boolean; data?: unknown; error?: string }>
      syncWithLanPeer: (data: { peerIp: string; peerPort?: number; passcode?: string }) => Promise<{ success: boolean; data?: LanSyncResult; error?: string }>
      getLanStatus: () => Promise<{ success: boolean; data?: LanStatusResponse; error?: string }>
    }
  }
}
