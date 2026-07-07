let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	getSubjects: () => electron.ipcRenderer.invoke("get-subjects"),
	getIncidents: () => electron.ipcRenderer.invoke("get-incidents"),
	getSummary: () => electron.ipcRenderer.invoke("get-summary"),
	addSubject: (data) => electron.ipcRenderer.invoke("add-subject", data),
	addIncident: (data) => electron.ipcRenderer.invoke("add-incident", data),
	updateSubject: (data) => electron.ipcRenderer.invoke("update-subject", data),
	setTheme: (mode) => electron.ipcRenderer.invoke("set-theme", mode),
	addCheckout: (data) => electron.ipcRenderer.invoke("add-checkout", data),
	returnCheckout: (data) => electron.ipcRenderer.invoke("return-checkout", data),
	getOverdueCheckouts: () => electron.ipcRenderer.invoke("get-overdue-checkouts"),
	checkDbStatus: () => electron.ipcRenderer.invoke("check-db-status"),
	setupDb: (password) => electron.ipcRenderer.invoke("setup-db", password),
	unlockDb: (args) => electron.ipcRenderer.invoke("unlock-db", args),
	changePassword: (args) => electron.ipcRenderer.invoke("change-password", args)
});
//#endregion
