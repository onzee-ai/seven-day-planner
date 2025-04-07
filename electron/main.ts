import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Store from 'electron-store'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'

// 获取 __dirname 的 ES 模块等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 尝试从旧的位置迁移数据
function migrateDataFromOldLocation() {
  const oldPaths = [
    join(homedir(), 'Library/Application Support/Electron/tasks.json'),
    join(homedir(), 'Library/Application Support/electron-store/tasks.json')
  ]
  
  for (const oldPath of oldPaths) {
    try {
      if (existsSync(oldPath)) {
        console.log(`找到旧数据文件: ${oldPath}`)
        const oldData = JSON.parse(readFileSync(oldPath, 'utf8'))
        const newStore = new Store({
          name: 'tasks',
          cwd: app.getPath('userData')
        })
        
        // 只有当目标存储为空时才迁移
        const existingTasks = newStore.get('tasks')
        if (!existingTasks || (Array.isArray(existingTasks) && existingTasks.length === 0)) {
          console.log('迁移旧数据到新位置')
          newStore.set('tasks', oldData.tasks || [])
          // 可选：备份旧文件而不是删除
          writeFileSync(`${oldPath}.bak`, readFileSync(oldPath))
          console.log('数据迁移完成')
        } else {
          console.log('新存储已有数据，跳过迁移')
        }
        return true
      }
    } catch (error) {
      console.error(`尝试迁移数据时出错: ${error}`)
    }
  }
  
  return false
}

// 初始化 electron-store
const store = new Store({
  name: 'tasks',
  cwd: app.getPath('userData'),
  defaults: {
    tasks: []
  }
})

// 尝试迁移数据
migrateDataFromOldLocation()

console.log('Store initialized with path:', store.path)

// 设置环境变量
const DIST_ELECTRON = join(__dirname, '..')
const DIST = join(DIST_ELECTRON, '../dist')
const PUBLIC = app.isPackaged ? DIST : join(DIST_ELECTRON, '../public')

// 开发环境URL
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL = 'http://127.0.0.1:5173'

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
const preload = join(__dirname, 'preload.js')

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

  // 开发环境下打开开发者工具
  const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    console.log('[Main] Development mode detected, opening DevTools')
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

app.whenReady().then(async () => {
  console.log('App is ready, creating window...')
  
  // 使用单例锁
  const isFirstInstance = app.requestSingleInstanceLock()
  
  // 只有第一个实例才创建窗口
  if (isFirstInstance) {
    // 检查是否已经有窗口打开
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('No window found, creating new window')
      createWindow()
    } else {
      console.log('Window already exists, focusing existing window')
      BrowserWindow.getAllWindows()[0].focus()
    }
  } else {
    console.log('Not first instance, quitting')
    app.quit()
  }
})

// 确保 window-all-closed 事件处理程序正确清理变量
app.on('window-all-closed', () => {
  console.log('All windows closed')
  win = null
  if (process.platform !== 'darwin') app.quit()
})

// 修改第二个实例的处理方式
app.on('second-instance', () => {
  console.log('Second instance detected, focusing existing window')
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  } else {
    // 如果由于某种原因 win 为 null 但有其他窗口
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length > 0) {
      allWindows[0].focus()
    }
  }
})

// 修改 activate 处理程序
app.on('activate', () => {
  console.log('App activated')
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    console.log('Window exists, focusing')
    allWindows[0].focus()
  } else {
    console.log('No window exists, creating new window')
    createWindow()
  }
})
