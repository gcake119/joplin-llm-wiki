const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jbHealth", {
  getMeta: () => ipcRenderer.invoke("get-meta"),
  checkHealth: () => ipcRenderer.invoke("check-health"),
  readConfig: () => ipcRenderer.invoke("read-config"),
  loadConfigFields: () => ipcRenderer.invoke("load-config-fields"),
  saveConfig: (yamlText) => ipcRenderer.invoke("save-config", yamlText),
  saveConfigFields: (fields) => ipcRenderer.invoke("save-config-fields", fields),
  runStackScript: (payload) => ipcRenderer.invoke("run-stack-script", payload),
  startLocalDependency: (payload) => ipcRenderer.invoke("start-local-dependency", payload),
});
