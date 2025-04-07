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
  cwd: app.getPath('userData'),
  defaults: {
    tasks: []
  }
})

// 设置环境变量
const DIST_ELECTRON = join(__dirname, '..')
const DIST = join(DIST_ELECTRON, '../dist')
const PUBLIC = app.isPackaged ? DIST : join(DIST_ELECTRON, '../public')

process.env.DIST_ELECTRON = DIST_ELECTRON
process.env.DIST = DIST
process.env.PUBLIC = PUBLIC

// Windows 相关设置
if (release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

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

let win: BrowserWindow | null = null
// 正确设置 preload 路径，指向 dist-electron 目录
const preload = join(DIST_ELECTRON, 'preload/index.js')

async function createWindow() {
  // 设置应用图标路径
  const iconPath = join(process.env.PUBLIC || '', 'icons', 'ico.png')

  win = new BrowserWindow({
    title: '七日计划',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
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
    await win.loadFile(join(DIST, 'index.html'))
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

// 多实例处理
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// 应用激活处理
app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
}) 