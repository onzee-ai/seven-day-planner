import { createRouter, createWebHashHistory } from 'vue-router'

// 动态导入组件，按需加载
const HomePage = () => import('./views/HomePage.vue')
const SettingsPage = () => import('./views/SettingsPage.vue')
const ReportPage = () => import('./views/ReportPage.vue')

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomePage
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsPage
  },
  {
    path: '/report',
    name: 'Report',
    component: ReportPage,
    beforeEnter: (to, from, next) => {
      // 检查localStorage是否有报告数据
      const hasReportData = localStorage.getItem('temp-report-data')
      
      // 检查是否从Electron API直接跳转
      const isElectronNavigation = window.electronAPI?.report && 
                                   (from.path === '/' || !from.name)
      
      if (hasReportData || isElectronNavigation) {
        // 有数据或从正确的地方跳转，允许访问
        next()
      } else {
        // 没有数据且不是从正确的地方跳转，重定向到首页
        console.warn('Redirecting from Report page to Home (no data)')
        next({ name: 'Home' })
      }
    }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 全局路由错误处理
router.onError((error) => {
  console.error('Router error:', error)
})

export default router 