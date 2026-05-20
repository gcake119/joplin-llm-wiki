const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jbHealth", {
  getMeta: () => ipcRenderer.invoke("get-meta"),
  checkHealth: () => ipcRenderer.invoke("check-health"),
  readConfig: () => ipcRenderer.invoke("read-config"),
  loadConfigFields: () => ipcRenderer.invoke("load-config-fields"),
  saveConfig: (yamlText) => ipcRenderer.invoke("save-config", yamlText),
  saveConfigFields: (fields) => ipcRenderer.invoke("save-config-fields", fields),
  listNotebooks: () => ipcRenderer.invoke("list-notebooks"),
  saveNotebookFilter: (payload) => ipcRenderer.invoke("save-notebook-filter", payload),
  runStackScript: (payload) => ipcRenderer.invoke("run-stack-script", payload),
  runInitPipeline: (payload) => ipcRenderer.invoke("run-init-pipeline", payload),
  runCorpusPipeline: (payload) => ipcRenderer.invoke("run-corpus-pipeline", payload),
  subscribePipelineProgress: (handler) => {
    const fn = (_e, /** @type {unknown} */ data) => handler(data);
    ipcRenderer.on("pipeline-progress", fn);
    return () => ipcRenderer.removeListener("pipeline-progress", fn);
  },
  startLocalDependency: (payload) => ipcRenderer.invoke("start-local-dependency", payload),
});
