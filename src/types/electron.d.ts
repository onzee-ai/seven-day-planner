/**
 * 全局Electron API类型声明
 */
declare interface Window {
  electronAPI?: {
    store?: {
      get: (key: string) => Promise<any>
      set: (key: string, value: any) => Promise<boolean>
    }
    apiKeys?: {
      get: (keyName: string) => Promise<string>
      set: (keyName: string, value: string) => Promise<boolean>
      validateDeepseek: (apiKey: string) => Promise<boolean>
      validateOpenAI: (apiKey: string) => Promise<boolean>
    }
    ai?: {
      generateSummary: (provider: string, prompt: string) => Promise<string>
    }
    settings?: {
      open: () => Promise<void>
    }
    report?: {
      show: (reportData: {
        title: string
        content: string
        date: string
        type: string
        provider: string
        createdAt: number
      }) => Promise<boolean>
      getReportData: () => Promise<any>
    }
    isDev?: boolean
  }
} 