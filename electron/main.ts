import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Store from 'electron-store'
import { existsSync } from 'fs'
import { net } from 'electron'

// 获取 __dirname 的 ES 模块等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 设置 preload 路径
const preload = join(__dirname, 'preload.js')

// 初始化 electron-store
const store = new Store({
  name: 'tasks',
  cwd: app.getPath('userData'),
  defaults: {
    tasks: []
  }
})

// 初始化API密钥存储
const apiKeyStore = new Store({
  name: 'api-keys',
  cwd: app.getPath('userData'),
  defaults: {
    deepseek: '',
    openai: ''
  },
  encryptionKey: 'seven-day-planner-encryption-key' // 加密存储API密钥
})

// 设置任务数据IPC处理程序
ipcMain.handle('electron-store-get', async (_event, key) => {
  try {
    return store.get(key)
  } catch (error) {
    console.error('Error getting data:', error)
    return null
  }
})

ipcMain.handle('electron-store-set', async (_event, { key, value }) => {
  try {
    store.set(key, value)
    return true
  } catch (error) {
    console.error('Error setting data:', error)
    return false
  }
})

// 设置API密钥管理IPC处理程序
ipcMain.handle('get-api-key', async (_event, keyName) => {
  try {
    return apiKeyStore.get(keyName)
  } catch (error) {
    console.error('Error getting API key:', error)
    return null
  }
})

ipcMain.handle('set-api-key', async (_event, { keyName, value }) => {
  try {
    apiKeyStore.set(keyName, value)
    return true
  } catch (error) {
    console.error('Error setting API key:', error)
    return false
  }
})

// 删除API密钥
ipcMain.handle('delete-api-key', async (_event, keyName) => {
  try {
    apiKeyStore.delete(keyName)
    return true
  } catch (error) {
    console.error('Error deleting API key:', error)
    return false
  }
})

// 验证DeepSeek API密钥
ipcMain.handle('validate-deepseek-key', async (_event, apiKey) => {
  try {
    const response = await fetch('https://api.deepseek.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    return response.ok
  } catch (error) {
    console.error('Error validating DeepSeek API key:', error)
    return false
  }
})

// 验证OpenAI API密钥
ipcMain.handle('validate-openai-key', async (_event, apiKey) => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    return response.ok
  } catch (error) {
    console.error('Error validating OpenAI API key:', error)
    return false
  }
})

// 处理AI生成总结请求
ipcMain.handle('ai-generate-summary', async (_, { provider, prompt }) => {
  try {
    console.log(`[AI] Generate summary request with ${provider}`)
    
    // 获取API密钥
    let apiKey;
    if (provider === 'deepseek') {
      apiKey = apiKeyStore.get('deepseek') as string;
    } else if (provider === 'openai') {
      apiKey = apiKeyStore.get('openai') as string;
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
    
    if (!apiKey) {
      throw new Error(`${provider} API key not found`);
    }
    
    let result = '';
    
    // 根据不同提供商调用不同API
    if (provider === 'deepseek') {
      result = await generateDeepseekSummary(apiKey, prompt);
    } else if (provider === 'openai') {
      result = await generateOpenAISummary(apiKey, prompt);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
    
    return result;
  } catch (error) {
    console.error('[AI] Error generating summary:', error);
    throw error;
  }
})

// DeepSeek AI 生成总结
async function generateDeepseekSummary(apiKey: string, prompt: string): Promise<string> {
  try {
    console.log('[AI] 调用真实DeepSeek API')
    // 以下是实际API调用的实现
    // 注意：以下代码需要根据实际DeepSeek API替换
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${data.error?.message || 'Unknown error'}`)
    }
    
    return data.choices[0].message.content
  } catch (error) {
    console.error('[AI] DeepSeek API error:', error)
    throw new Error(`DeepSeek API error: ${error.message}`)
  }
}

// OpenAI 生成总结
async function generateOpenAISummary(apiKey: string, prompt: string): Promise<string> {
  try {
    console.log('[AI] 调用真实OpenAI API')
    // 以下是实际API调用的实现
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一位专业的工作任务分析助手，擅长总结和分析工作任务数据。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`)
    }
    
    return data.choices[0].message.content
  } catch (error) {
    console.error('[AI] OpenAI API error:', error)
    throw new Error(`OpenAI API error: ${error.message}`)
  }
}

// Windows 相关设置
if (release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

let win: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let reportWin: BrowserWindow | null = null  // 添加报告窗口引用
let reportData: any = null  // 添加报告数据存储

// 打开设置窗口
ipcMain.handle('open-settings', async () => {
  if (settingsWin) {
    settingsWin.focus()
    return
  }
  
  createSettingsWindow()
})

// 创建设置窗口函数
async function createSettingsWindow() {
  settingsWin = new BrowserWindow({
    title: '设置 - 七日计划',
    width: 600,
    height: 500,
    backgroundColor: '#f5f5f5',
    parent: win || undefined,
    modal: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })
  
  // 窗口关闭时清除引用
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  
  // 开发环境
  if (process.env.VITE_DEV_SERVER_URL) {
    await settingsWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/settings`)
    return
  }
  
  // 生产环境: 加载打包后的Vue应用
  try {
    const indexPath = join(app.getAppPath(), 'dist/index.html')
    
    if (existsSync(indexPath)) {
      await settingsWin.loadURL(`file://${indexPath}#/settings`)
    } else {
      // 如找不到index.html，回退到内联HTML
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>设置 - 七日计划</title>
            <style>
              body { 
                font-family: -apple-system, system-ui, sans-serif; 
                margin: 0; 
                padding: 20px;
                background-color: #f5f5f5;
                color: #333;
              }
              .container {
                text-align: center;
                padding: 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 16px rgba(0,0,0,0.1);
              }
              h1 { 
                color: #42b983;
                margin-bottom: 20px;
              }
              p {
                line-height: 1.6;
                font-size: 16px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>设置</h1>
              <p>设置页面加载失败，请重新启动应用。</p>
            </div>
          </body>
        </html>
      `;
      
      await settingsWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }
  } catch (error) {
    console.error('加载设置页面时出错:', error)
    settingsWin.loadURL(`data:text/html,<html><body><h2>加载设置页面出错</h2><p>${error.message}</p></body></html>`)
  }
}

// 创建窗口函数
async function createWindow() {
  // 创建窗口
  win = new BrowserWindow({
    title: '七日计划',
    width: 1200,
    height: 800,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })
  
  // 开发环境
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
    return
  }
  
  // 生产环境: 加载打包后的Vue应用
  try {
    // 尝试加载完整的Vue应用
    const indexPath = join(app.getAppPath(), 'dist/index.html')
    
    if (existsSync(indexPath)) {
      await win.loadFile(indexPath)
    } else {
      // 如找不到index.html，回退到内联HTML
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>七日计划</title>
            <style>
              body { 
                font-family: -apple-system, system-ui, sans-serif; 
                margin: 0; 
                padding: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background-color: #f5f5f5;
                color: #333;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 16px rgba(0,0,0,0.1);
                max-width: 600px;
              }
              h1 { 
                color: #42b983;
                margin-bottom: 20px;
              }
              button {
                background-color: #42b983;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                margin-top: 30px;
                transition: background-color 0.2s;
              }
              button:hover {
                background-color: #3aa776;
              }
              p {
                line-height: 1.6;
                font-size: 16px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>七日计划</h1>
              <p>欢迎使用七日计划应用。这是一个简单的任务规划工具，帮助您更好地管理时间。</p>
              <p>如需查看完整功能，请使用开发模式运行应用程序。</p>
              <button onclick="alert('按钮点击成功!')">测试按钮</button>
            </div>
          </body>
        </html>
      `;
      
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }
  } catch (error) {
    console.error('加载应用时出错:', error)
    win.loadURL(`data:text/html,<html><body><h2>加载应用出错</h2><p>${error.message}</p></body></html>`)
  }
}

// 应用就绪时创建窗口
app.whenReady().then(createWindow)

// 窗口关闭处理
app.on('window-all-closed', () => {
  win = null
  settingsWin = null
  if (process.platform !== 'darwin') app.quit()
})

// 应用激活处理
app.on('activate', () => {
  if (!win) createWindow()
})

// 添加报告相关IPC处理程序
ipcMain.handle('show-report', async (_, data) => {
  // 保存报告数据
  reportData = data
  
  // 创建新窗口显示报告
  await createReportWindow()
  return true
})

ipcMain.handle('get-report-data', async () => {
  // 返回报告数据
  return reportData
})

// 添加打开新报告窗口的方法
ipcMain.handle('open-new-report', async (_, data) => {
  // 保存新的报告数据
  reportData = data
  
  // 如果报告窗口已存在，先关闭它
  if (reportWin) {
    reportWin.close()
    reportWin = null
  }
  
  // 创建新窗口显示报告
  await createReportWindow()
  return true
})

// 创建报告窗口函数
async function createReportWindow() {
  if (reportWin) {
    reportWin.focus()
    return
  }
  
  reportWin = new BrowserWindow({
    title: reportData?.title || '工作日报',
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    parent: win || undefined,
    modal: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })
  
  // 窗口关闭时清除引用
  reportWin.on('closed', () => {
    reportWin = null
  })
  
  // 开发环境
  if (process.env.VITE_DEV_SERVER_URL) {
    await reportWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/report`)
    return
  }
  
  // 生产环境: 加载打包后的Vue应用
  try {
    const indexPath = join(app.getAppPath(), 'dist/index.html')
    
    if (existsSync(indexPath)) {
      await reportWin.loadURL(`file://${indexPath}#/report`)
    } else {
      // 如找不到index.html，回退到内联HTML
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>工作日报</title>
            <style>
              body { 
                font-family: -apple-system, system-ui, sans-serif; 
                margin: 0; 
                padding: 20px;
                background-color: #ffffff;
                color: #333;
              }
              .container {
                text-align: center;
                padding: 20px;
                border-radius: 12px;
              }
              h1 { 
                color: #42b983;
                margin-bottom: 20px;
              }
              p {
                line-height: 1.6;
                font-size: 16px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>工作日报</h1>
              <p>报告页面加载失败，请重新启动应用。</p>
            </div>
          </body>
        </html>
      `;
      
      await reportWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }
  } catch (error) {
    console.error('加载报告页面时出错:', error)
    reportWin.loadURL(`data:text/html,<html><body><h2>加载报告页面出错</h2><p>${error.message}</p></body></html>`)
  }
}
