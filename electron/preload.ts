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
        getApiKey: (keyName: string) => Promise<string>
        setApiKey: (keyName: string, value: string) => Promise<boolean>
        deleteApiKey: (keyName: string) => Promise<boolean>
        validateApiKey: (keyName: string) => Promise<boolean>
      },
      ai: {
        generateSummary: (provider: string, prompt: string) => Promise<string>
      },
      settings: {
        open: () => Promise<void>
      },
      isDev: boolean,
      report: {
        show: (reportData: any) => Promise<boolean>
        getReportData: () => Promise<any>
        openNew: (reportData: any) => Promise<boolean>
      }
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
    validateOpenAI: (apiKey: string) => ipcRenderer.invoke('validate-openai-key', apiKey),
    getApiKey: (keyName: string) => ipcRenderer.invoke('get-api-key', keyName),
    setApiKey: (keyName: string, value: string) => ipcRenderer.invoke('set-api-key', { keyName, value }),
    deleteApiKey: (keyName: string) => ipcRenderer.invoke('delete-api-key', keyName),
    validateApiKey: (keyName: string) => ipcRenderer.invoke('validate-api-key', keyName)
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
    getReportData: () => ipcRenderer.invoke('get-report-data'),
    openNew: (reportData: any) => ipcRenderer.invoke('open-new-report', reportData)
  }
})

console.log('[Preload] electronAPI exposed to window, isDev:', isDev)
