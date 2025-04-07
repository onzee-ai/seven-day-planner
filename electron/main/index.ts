import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Store from 'electron-store'
import { existsSync } from 'fs'

// 获取 __dirname 的 ES 模块等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 初始化 electron-store
const store = new Store({
  name: 'tasks',
  defaults: {
    tasks: []
  }
})

console.log('Store initialized with path:', store.path)

// 设置环境变量
const DIST_ELECTRON = join(__dirname, '..')
const DIST = join(DIST_ELECTRON, '../dist')
const PUBLIC = app.isPackaged ? DIST : join(DIST_ELECTRON, '../public')

process.env.DIST_ELECTRON = DIST_ELECTRON
process.env.DIST = DIST
process.env.PUBLIC = PUBLIC

console.log('Environment variables set:', {
  DIST_ELECTRON,
  DIST,
  PUBLIC
})

// Windows 7 禁用 GPU 加速
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Windows 10+ 通知
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// 设置 IPC 处理程序
ipcMain.handle('electron-store-get', async (_event, key) => {
  try {
    console.log('Getting data for key:', key)
    const value = store.get(key)
    console.log('Retrieved value:', value)
    return value
  } catch (error) {
    console.error('Error getting data:', error)
    return null
  }
})

ipcMain.handle('electron-store-set', async (_event, { key, value }) => {
  try {
    console.log('Setting data for key:', key, 'value:', value)
    store.set(key, value)
    console.log('Data set successfully')
    return true
  } catch (error) {
    console.error('Error setting data:', error)
    return false
  }
})

let win: BrowserWindow | null = null
// 正确设置 preload 路径，指向 dist-electron 目录
const preload = join(DIST_ELECTRON, 'preload/index.js')

console.log('Preload script path (final):', preload)

// 检查 preload 路径是否正确，使用 fs 模块
console.log('File exists check:', { 
  exists: existsSync(preload),
  dirname: __dirname
})

async function createWindow() {
  console.log('[Main] Creating window...')
  win = new BrowserWindow({
    title: '七日计划',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  // 监听 preload 脚本就绪事件
  ipcMain.on('preload-ready', () => {
    console.log('[Main] Received preload-ready event, preload script has finished initializing')
    console.log('[Main] Preload script path:', preload)
    
    if (win) {
      console.log('[Main] BrowserWindow exists, sending confirmation to renderer')
      try {
        win.webContents.send('main-acknowledged')
        console.log('[Main] Successfully sent main-acknowledged event to renderer')
      } catch (error) {
        console.error('[Main] Failed to send event to renderer:', error)
      }
    } else {
      console.error('[Main] BrowserWindow does not exist')
    }
  })

  // 开发环境下打开开发者工具
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[Main] Opening DevTools in development mode')
    win.webContents.openDevTools()
  }

  // 调试事件监听
  win.webContents.on('did-start-loading', () => {
    console.log('[Main] Window started loading')
  })

  win.webContents.on('did-finish-load', () => {
    console.log('[Main] Window finished loading')
  })

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] Window failed to load:', errorCode, errorDescription)
  })

  // 添加更多调试事件
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('[Renderer Console]', { level, message, line, sourceId })
  })

  win.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('[Main] Preload script error:', { preloadPath, error })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading development URL:', process.env.VITE_DEV_SERVER_URL)
    await win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    console.log('[Main] Loading production file:', join(DIST, 'index.html'))
    await win.loadFile(join(DIST, 'index.html'))
  }

  // 使用默认浏览器打开外部链接
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  console.log('App is ready, creating window...')
  createWindow()
})

app.on('window-all-closed', () => {
  console.log('All windows closed')
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
}) 