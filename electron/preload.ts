import { ipcRenderer, contextBridge } from 'electron'

// Define the exact signature of our exposed API
contextBridge.exposeInMainWorld('electronAPI', {
  getSubjects: () => ipcRenderer.invoke('get-subjects'),
  getIncidents: () => ipcRenderer.invoke('get-incidents'),
  getSummary: () => ipcRenderer.invoke('get-summary'),
  addSubject: (data: any) => ipcRenderer.invoke('add-subject', data),
  addIncident: (data: any) => ipcRenderer.invoke('add-incident', data),
  updateSubject: (data: any) => ipcRenderer.invoke('update-subject', data),
  setTheme: (mode: 'light' | 'dark') => ipcRenderer.invoke('set-theme', mode),
  addCheckout: (data: any) => ipcRenderer.invoke('add-checkout', data),
  returnCheckout: (data: any) => ipcRenderer.invoke('return-checkout', data),
  getOverdueCheckouts: () => ipcRenderer.invoke('get-overdue-checkouts'),
  getAuditLogs: () => ipcRenderer.invoke('get-audit-logs'),
  checkDbStatus: () => ipcRenderer.invoke('check-db-status'),
  setupDb: (password: string) => ipcRenderer.invoke('setup-db', password),
  unlockDb: (args: { password?: string, isRecovery?: boolean }) => ipcRenderer.invoke('unlock-db', args),
  changePassword: (args: { oldPassword?: string, newPassword?: string }) => ipcRenderer.invoke('change-password', args),
  backupDatabase: () => ipcRenderer.invoke('backup-database'),
  getBorrowingRules: () => ipcRenderer.invoke('get-borrowing-rules'),
  saveBorrowingRule: (data: any) => ipcRenderer.invoke('save-borrowing-rule', data),
  deleteBorrowingRule: (id: number) => ipcRenderer.invoke('delete-borrowing-rule', id),
  getClearanceStatus: (data: any) => ipcRenderer.invoke('get-clearance-status', data),
  generateClearanceSlip: (data: any) => ipcRenderer.invoke('generate-clearance-slip', data),
  createStockAudit: (data?: any) => ipcRenderer.invoke('create-stock-audit', data),
  saveStockAuditItem: (data: any) => ipcRenderer.invoke('save-stock-audit-item', data),
  completeStockAudit: (data: any) => ipcRenderer.invoke('complete-stock-audit', data),
  getStockAudits: (id?: number) => ipcRenderer.invoke('get-stock-audits', id),
  getDepreciationAnalytics: () => ipcRenderer.invoke('get-depreciation-analytics'),
  getCirculationInsights: () => ipcRenderer.invoke('get-circulation-insights'),
  getBackupConfig: () => ipcRenderer.invoke('get-backup-config'),
  saveBackupConfig: (data: any) => ipcRenderer.invoke('save-backup-config', data),
  triggerAutoBackup: (customPath?: string) => ipcRenderer.invoke('trigger-auto-backup', customPath),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  getLanSyncConfig: () => ipcRenderer.invoke('get-lan-sync-config'),
  saveLanSyncConfig: (data: any) => ipcRenderer.invoke('save-lan-sync-config', data),
  syncWithLanPeer: (data: any) => ipcRenderer.invoke('sync-with-lan-peer', data),
  getLanStatus: () => ipcRenderer.invoke('get-lan-status')
})


