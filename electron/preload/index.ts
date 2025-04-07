import { ipcRenderer, contextBridge } from 'electron'

// 声明 window 接口扩展
declare global {
  interface Window {
    electronAPI: {
      store: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<boolean>
      }
    }
  }
}

console.log('[Preload] Script executing')

// 使用 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('electron-store-get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('electron-store-set', { key, value })
  }
})

console.log('[Preload] electronAPI exposed to window') 