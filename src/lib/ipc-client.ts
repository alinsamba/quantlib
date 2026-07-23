function invoke(method: string, ...args: any[]) {
  if (!window.electronAPI) {
    return Promise.reject(new Error('Electron preload is not available. Restart the desktop app with npm run dev.'))
  }
  const fn = (window.electronAPI as any)[method]
  return fn(...args).then((res: any) => {
    if (res && res.success === false) throw new Error(res.error)
    return res && 'data' in res ? res.data : res
  })
}

export const db = {
  getSubjects: () => invoke('getSubjects'),
  getIncidents: () => invoke('getIncidents'),
  getSummary: () => invoke('getSummary'),
  addSubject: (data: any) => invoke('addSubject', data),
  addIncident: (data: any) => invoke('addIncident', data),
  updateSubject: (id: number, data: any) => invoke('updateSubject', { id, data }),
  setTheme: (mode: 'light' | 'dark') => invoke('setTheme', mode),
  addCheckout: (data: any) => invoke('addCheckout', data),
  returnCheckout: (id: number, conditionIn: number) => invoke('returnCheckout', { id, conditionIn }),
  getOverdueCheckouts: () => invoke('getOverdueCheckouts'),
  getAuditLogs: () => invoke('getAuditLogs'),
  
  // Auth methods don't unwrap since Login.tsx expects the full response object
  checkDbStatus: () => {
    if (!window.electronAPI) return Promise.reject(new Error('Electron preload is not available.'))
    return window.electronAPI.checkDbStatus()
  },
  setupDb: (password: string) => {
    if (!window.electronAPI) return Promise.reject(new Error('Electron preload is not available.'))
    return window.electronAPI.setupDb(password)
  },
  unlockDb: (args: { password?: string, isRecovery?: boolean }) => {
    if (!window.electronAPI) return Promise.reject(new Error('Electron preload is not available.'))
    return window.electronAPI.unlockDb(args)
  },
  changePassword: (args: { oldPassword?: string, newPassword?: string }) => {
    if (!window.electronAPI) return Promise.reject(new Error('Electron preload is not available.'))
    return window.electronAPI.changePassword(args)
  },
  backupDatabase: () => invoke('backupDatabase'),
  getBorrowingRules: () => invoke('getBorrowingRules'),
  saveBorrowingRule: (data: any) => invoke('saveBorrowingRule', data),
  deleteBorrowingRule: (id: number) => invoke('deleteBorrowingRule', id),
  getClearanceStatus: (data: { studentName: string, studentClass?: string }) => invoke('getClearanceStatus', data),
  generateClearanceSlip: (data: { studentName: string, studentClass?: string }) => invoke('generateClearanceSlip', data),
  createStockAudit: (data?: { auditedBy?: string, notes?: string }) => invoke('createStockAudit', data),
  saveStockAuditItem: (data: { auditId: number, subjectId: number, actualCount: number, notes?: string }) => invoke('saveStockAuditItem', data),
  completeStockAudit: (data: { auditId: number, notes?: string }) => invoke('completeStockAudit', data),
  getStockAudits: (id?: number) => invoke('getStockAudits', id),
  getDepreciationAnalytics: () => invoke('getDepreciationAnalytics'),
  getCirculationInsights: () => invoke('getCirculationInsights'),
  getBackupConfig: () => invoke('getBackupConfig'),
  saveBackupConfig: (data: any) => invoke('saveBackupConfig', data),
  triggerAutoBackup: (customPath?: string) => invoke('triggerAutoBackup', customPath),
  listBackups: () => invoke('listBackups'),
  getLanSyncConfig: () => invoke('getLanSyncConfig'),
  saveLanSyncConfig: (data: any) => invoke('saveLanSyncConfig', data),
  syncWithLanPeer: (data: { peerIp: string, peerPort?: number, passcode?: string }) => invoke('syncWithLanPeer', data),
  getLanStatus: () => invoke('getLanStatus')
}


