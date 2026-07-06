export const db = {
  getSubjects: () => window.ipcRenderer.invoke('get-subjects'),
  getIncidents: () => window.ipcRenderer.invoke('get-incidents'),
  getSummary: () => window.ipcRenderer.invoke('get-summary'),
  addSubject: (data: any) => window.ipcRenderer.invoke('add-subject', data),
  addIncident: (data: any) => window.ipcRenderer.invoke('add-incident', data),
  updateSubject: (id: number, data: any) => window.ipcRenderer.invoke('update-subject', { id, data }),
}
