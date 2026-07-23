export {}

declare global {
  interface Window {
    electronAPI: {
      getSubjects: () => Promise<{ success: boolean, data?: any, error?: string }>
      getIncidents: () => Promise<{ success: boolean, data?: any, error?: string }>
      getSummary: () => Promise<{ success: boolean, data?: any, error?: string }>
      addSubject: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      addIncident: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      updateSubject: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      setTheme: (mode: 'light' | 'dark') => Promise<{ success: boolean, data?: any, error?: string }>
      addCheckout: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      returnCheckout: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      getOverdueCheckouts: () => Promise<{ success: boolean, data?: any, error?: string }>
      getAuditLogs: () => Promise<{ success: boolean, data?: any, error?: string }>
      checkDbStatus: () => Promise<'SETUP' | 'LOCKED'>
      setupDb: (password: string) => Promise<{ success: boolean, recoveryKey?: string, error?: string }>
      unlockDb: (args: { password?: string, isRecovery?: boolean }) => Promise<{ success: boolean, error?: string }>
      changePassword: (args: { oldPassword?: string, newPassword?: string }) => Promise<{ success: boolean, recoveryKey?: string, error?: string }>
      backupDatabase: () => Promise<{ success: boolean, error?: string }>
      getBorrowingRules: () => Promise<{ success: boolean, data?: any, error?: string }>
      saveBorrowingRule: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      deleteBorrowingRule: (id: number) => Promise<{ success: boolean, data?: any, error?: string }>
      getClearanceStatus: (data: { studentName: string, studentClass?: string }) => Promise<{ success: boolean, data?: any, error?: string }>
      generateClearanceSlip: (data: { studentName: string, studentClass?: string }) => Promise<{ success: boolean, data?: any, error?: string }>
      createStockAudit: (data?: { auditedBy?: string, notes?: string }) => Promise<{ success: boolean, data?: any, error?: string }>
      saveStockAuditItem: (data: { auditId: number, subjectId: number, actualCount: number, notes?: string }) => Promise<{ success: boolean, data?: any, error?: string }>
      completeStockAudit: (data: { auditId: number, notes?: string }) => Promise<{ success: boolean, data?: any, error?: string }>
      getStockAudits: (id?: number) => Promise<{ success: boolean, data?: any, error?: string }>
      getDepreciationAnalytics: () => Promise<{ success: boolean, data?: any, error?: string }>
      getCirculationInsights: () => Promise<{ success: boolean, data?: any, error?: string }>
      getBackupConfig: () => Promise<{ success: boolean, data?: any, error?: string }>
      saveBackupConfig: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      triggerAutoBackup: (customPath?: string) => Promise<{ success: boolean, backupPath?: string, filename?: string, error?: string }>
      listBackups: () => Promise<{ success: boolean, data?: any, error?: string }>
      getLanSyncConfig: () => Promise<{ success: boolean, data?: any, error?: string }>
      saveLanSyncConfig: (data: any) => Promise<{ success: boolean, data?: any, error?: string }>
      syncWithLanPeer: (data: { peerIp: string, peerPort?: number, passcode?: string }) => Promise<{ success: boolean, data?: any, error?: string }>
      getLanStatus: () => Promise<{ success: boolean, data?: any, error?: string }>
    }
  }
}


