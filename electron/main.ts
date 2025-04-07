import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Store from 'electron-store'
import { existsSync } from 'fs'

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

// 设置 IPC 处理程序
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

// Windows 相关设置
if (release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

let win: BrowserWindow | null = null

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
  if (process.platform !== 'darwin') app.quit()
})

// 应用激活处理
app.on('activate', () => {
  if (!win) createWindow()
})
