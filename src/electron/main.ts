// 新增函数：创建报告窗口
function createReportWindow(summaryData: any) {
  // 创建新窗口
  const reportWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    },
    title: '报告详情',
    show: false, // 先不显示，等加载完成后再显示
  })

  // 设置窗口图标
  if (process.platform === 'linux') {
    reportWindow.setIcon(path.join(__dirname, '../resources/icon.png'))
  }
  
  // 关闭默认菜单
  reportWindow.setMenu(null)
  
  // 跟随主窗口
  reportWindow.setParentWindow(mainWindow)
  
  // 加载URL
  if (VITE_DEV_SERVER_URL) {
    reportWindow.loadURL(`${VITE_DEV_SERVER_URL}/#/report`)
  } else {
    reportWindow.loadFile(indexHtml, { hash: 'report' })
  }
  
  // 窗口准备好后显示
  reportWindow.once('ready-to-show', () => {
    reportWindow.show()
    
    // 等窗口加载完成后，通过IPC发送报告数据
    reportWindow.webContents.send('report-data', summaryData)
  })
  
  return reportWindow
}

// 处理显示报告的请求
ipcMain.handle('show-report', (event, summaryData) => {
  try {
    // 创建报告窗口并传递数据
    const reportWindow = createReportWindow(summaryData)
    return true
  } catch (error) {
    console.error('Failed to create report window:', error)
    return false
  }
}) 