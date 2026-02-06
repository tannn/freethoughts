const { contextBridge, ipcRenderer } = require('electron');

const api = {
  workspace: {
    open: (payload) => ipcRenderer.invoke('workspace.open', payload),
    create: (payload) => ipcRenderer.invoke('workspace.create', payload)
  },
  document: {
    import: (payload) => ipcRenderer.invoke('document.import', payload),
    reimport: (payload) => ipcRenderer.invoke('document.reimport', payload),
    locate: (payload) => ipcRenderer.invoke('document.locate', payload)
  },
  section: {
    list: (payload) => ipcRenderer.invoke('section.list', payload),
    get: (payload) => ipcRenderer.invoke('section.get', payload)
  },
  note: {
    create: (payload) => ipcRenderer.invoke('note.create', payload),
    update: (payload) => ipcRenderer.invoke('note.update', payload),
    delete: (payload) => ipcRenderer.invoke('note.delete', payload),
    reassign: (payload) => ipcRenderer.invoke('note.reassign', payload)
  },
  ai: {
    generateProvocation: (payload) => ipcRenderer.invoke('ai.generateProvocation', payload),
    cancel: (payload) => ipcRenderer.invoke('ai.cancel', payload)
  },
  settings: {
    get: (payload = {}) => ipcRenderer.invoke('settings.get', payload),
    update: (payload) => ipcRenderer.invoke('settings.update', payload)
  },
  network: {
    status: (payload = {}) => ipcRenderer.invoke('network.status', payload)
  }
};

contextBridge.exposeInMainWorld('tft', api);
