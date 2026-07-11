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
    }
  }
}
