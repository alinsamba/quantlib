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
  changePassword: (args: { oldPassword?: string, newPassword?: string }) => ipcRenderer.invoke('change-password', args)
})
