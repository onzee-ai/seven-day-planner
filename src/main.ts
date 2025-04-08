import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import './style.css'
import router from './router'
import App from './App.vue'

// 全局错误处理
const handleError = (err: any, instance: any, info: string) => {
  console.error('Vue Error:', err)
  console.error('Component:', instance)
  console.error('Info:', info)
}

// 创建应用实例
const app = createApp(App)
app.config.errorHandler = handleError
app.config.warnHandler = (msg, instance, trace) => {
  console.warn('[Vue Warning]:', msg)
}

// 处理未捕获的Promise错误
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason)
  event.preventDefault()
})

// 注册全局组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 使用插件
app.use(ElementPlus)
app.use(router)

// 挂载应用
app.mount('#app')
