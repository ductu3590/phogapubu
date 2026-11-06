import { contextBridge, ipcRenderer } from 'electron'

// Cửa sổ ghép máy chỉ thấy đúng một hàm này, không có quyền Node
contextBridge.exposeInMainWorld('mevoPair', {
  submit: (code: string) => ipcRenderer.invoke('pair:submit', code),
})
