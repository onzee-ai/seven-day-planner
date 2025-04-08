import { ipcRenderer, contextBridge } from 'electron'

// 声明 window 接口扩展
declare global {
  interface Window {
    electronAPI: {
      store: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<boolean>
      },
      apiKeys: {
        get: (keyName: string) => Promise<string>
        set: (keyName: string, value: string) => Promise<boolean>
        validateDeepseek: (apiKey: string) => Promise<boolean>
        validateOpenAI: (apiKey: string) => Promise<boolean>
      },
      ai: {
        generateSummary: (provider: string, prompt: string) => Promise<string>
      },
      settings: {
        open: () => Promise<void>
      },
      isDev: boolean
    }
  }
}

console.log('[Preload] Script executing')

// 用于开发环境标识
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined

// 使用 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('electron-store-get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('electron-store-set', { key, value })
  },
  apiKeys: {
    get: (keyName: string) => ipcRenderer.invoke('get-api-key', keyName),
    set: (keyName: string, value: string) => ipcRenderer.invoke('set-api-key', { keyName, value }),
    validateDeepseek: (apiKey: string) => ipcRenderer.invoke('validate-deepseek-key', apiKey),
    validateOpenAI: (apiKey: string) => ipcRenderer.invoke('validate-openai-key', apiKey)
  },
  ai: {
    generateSummary: (provider: string, prompt: string) => ipcRenderer.invoke('ai-generate-summary', { provider, prompt })
  },
  settings: {
    open: () => ipcRenderer.invoke('open-settings')
  },
  isDev: isDev,
  
  // 报告相关功能
  report: {
    show: (summaryData: any) => ipcRenderer.invoke('show-report', summaryData),
    getReportData: () => new Promise((resolve) => {
      const handleReportData = (_event: Electron.IpcRendererEvent, data: any) => {
        resolve(data)
        // 接收到数据后移除监听器
        ipcRenderer.removeListener('report-data', handleReportData)
      }
      
      // 监听来自主进程的报告数据
      ipcRenderer.on('report-data', handleReportData)
    })
  }
})

console.log('[Preload] electronAPI exposed to window, isDev:', isDev)
