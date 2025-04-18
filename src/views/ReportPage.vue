<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject, watchEffect, readonly } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Printer, ArrowLeft, Refresh } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { useRouter } from 'vue-router'

// 路由
const router = useRouter()

// 获取注册清理函数的方法
const registerCleanup = inject('registerCleanup') as ((fn: () => void) => void) | undefined
const componentState = inject('componentState') as any

// 创建markdown解析器实例
const md = new MarkdownIt({
  html: true,      // 允许HTML标签
  breaks: true,    // 将\n转换为<br>
  linkify: true    // 将URL转换为链接
})

// 接口定义
interface ReportData {
  title: string
  content: string
  date: string
  type: string
  provider: string
  createdAt: number
}

// 报告数据
const reportData = ref<ReportData | null>(null)
const isLoading = ref(true)
const dataLoadError = ref(false)
// 记录是否已卸载组件
const isUnmounted = ref(false)

// 监听组件状态
watchEffect(() => {
  if (componentState && !componentState.value.active) {
    cleanup()
  }
})

// 加载报告数据
const loadReportData = async () => {
  if (isUnmounted.value) return
  
  isLoading.value = true
  dataLoadError.value = false
  
  try {
    // 首先尝试从localStorage获取临时报告数据（Web模式）
    const tempReportData = localStorage.getItem('temp-report-data')
    if (tempReportData) {
      if (!isUnmounted.value) {
        try {
          const parsed = JSON.parse(tempReportData)
          reportData.value = parsed as ReportData
          // 使用后清除临时数据
          localStorage.removeItem('temp-report-data')
        } catch (err) {
          console.error('Failed to parse report data from localStorage:', err)
          throw new Error('报告数据无效')
        }
      }
      return
    }
    
    // 如果没有临时数据，尝试从Electron API获取
    if (!window.electronAPI?.report) {
      throw new Error('报告功能不可用')
    }
    
    const data = await window.electronAPI.report.getReportData()
    if (data && !isUnmounted.value) {
      reportData.value = data as ReportData
    } else if (!data) {
      throw new Error('无法获取报告数据')
    }
  } catch (error: any) {
    console.error('[ReportPage] Failed to load report data:', error)
    if (!isUnmounted.value) {
      ElMessage.error(`加载报告数据失败: ${error.message || '未知错误'}`)
      dataLoadError.value = true
    }
  } finally {
    if (!isUnmounted.value) {
      isLoading.value = false
    }
  }
}

// 打印报告
const printReport = () => {
  if (isUnmounted.value) return
  window.print()
}

// 复制报告内容
const copyReport = () => {
  if (isUnmounted.value) return
  
  if (!reportData.value || !reportData.value.content) {
    ElMessage.warning('没有内容可复制')
    return
  }
  
  try {
    // 使用现代剪贴板API
    navigator.clipboard.writeText(reportData.value.content)
      .then(() => {
        ElMessage.success('已复制到剪贴板')
      })
      .catch(err => {
        // 如果现代API失败，回退到旧方法
        fallbackCopy()
      })
  } catch (e) {
    // 浏览器不支持剪贴板API时的回退方案
    fallbackCopy()
  }
}

// 回退复制方法
const fallbackCopy = () => {
  if (!reportData.value || !reportData.value.content) return
  
  // 创建一个临时元素来保存纯文本内容
  const el = document.createElement('textarea')
  el.value = reportData.value.content
  el.setAttribute('readonly', '')
  el.style.position = 'absolute'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  el.select()
  
  try {
    document.execCommand('copy')
    ElMessage.success('已复制到剪贴板')
  } catch (err) {
    console.error('Fallback copy failed:', err)
    ElMessage.error('复制失败，请手动复制')
  } finally {
    document.body.removeChild(el)
  }
}

// 返回主页
const goBack = () => {
  if (isUnmounted.value) return
  router.push('/')
}

// 格式化Markdown内容
const formattedContent = computed(() => {
  if (!reportData.value || !reportData.value.content) return ''
  try {
    return md.render(reportData.value.content)
  } catch (err) {
    console.error('Failed to render markdown:', err)
    return '内容渲染失败'
  }
})

// 安全清理函数
const cleanup = () => {
  isUnmounted.value = true
  reportData.value = null
}

// 组件挂载时加载报告数据
onMounted(async () => {
  isUnmounted.value = false
  
  // 注册清理函数
  if (registerCleanup) {
    registerCleanup(cleanup)
  }
  
  await loadReportData()
})

// 组件卸载前设置标志
onBeforeUnmount(() => {
  cleanup()
})

// 添加重新生成报告的方法
const regenerateReport = async (provider: 'local' | 'deepseek' | 'openai') => {
  if (isUnmounted.value || !reportData.value) return
  
  try {
    const currentDate = reportData.value.date
    
    // 确认重新生成
    await ElMessageBox.confirm(
      `确定要使用${provider === 'local' ? '本地' : provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'}重新生成报告吗？`,
      '重新生成报告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    ElMessage.info(`正在使用${provider === 'local' ? '本地' : provider}重新生成报告，请稍候...`)
    
    // 打开新窗口生成报告
    if (window.electronAPI?.report) {
      // 使用Electron API生成
      if (!window.electronAPI.store) {
        throw new Error('存储API不可用')
      }
      
      const tasksForDate = await window.electronAPI.store.get('tasks')
      if (!Array.isArray(tasksForDate) || tasksForDate.length === 0) {
        throw new Error('无法获取任务数据')
      }
      
      const currentDateTasks = tasksForDate.filter(t => t.date === currentDate)
      if (currentDateTasks.length === 0) {
        throw new Error(`${currentDate} 没有任务数据`)
      }
      
      // 根据provider决定生成方式
      let newReportData
      
      if (provider === 'local') {
        // 本地生成
        newReportData = generateLocalReport(currentDateTasks, currentDate)
      } else {
        // AI生成
        if (!window.electronAPI?.ai) {
          throw new Error('AI功能不可用')
        }
        
        // 构建提示词
        const tasksForPrompt = currentDateTasks
          .map(t => {
            return `- 任务: ${t.title}\n  状态: ${t.completed ? '已完成' : '未完成'}\n  详情: ${t.notes || '无'}\n  结果: ${t.result || '无'}`
          })
          .join('\n\n')
        
        const prompt = `请根据以下任务列表，生成一份简洁的日报总结，重点突出做了什么和没做什么，语言精炼，排版清晰：\n\n${tasksForPrompt}`
        
        // 调用指定的AI模型生成摘要
        const reportContent = await window.electronAPI.ai.generateSummary(provider, prompt)
        
        if (!reportContent) {
          throw new Error('生成报告内容为空')
        }
        
        newReportData = {
          title: `${currentDate} 工作日报 (${provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'}生成)`,
          content: reportContent,
          date: currentDate,
          type: 'daily',
          provider: provider,
          createdAt: Date.now()
        }
      }
      
      // 在新窗口显示
      if (newReportData) {
        // 处理不同Electron API版本的兼容性
        if (window.electronAPI?.report) {
          // 使用类型断言确保TypeScript编译通过
          const reportApi = window.electronAPI.report as any;
          if (!reportApi.openNew) {
            // 如果openNew方法不存在，使用show方法作为后备
            await reportApi.show(newReportData);
          } else {
            // 使用openNew方法
            await reportApi.openNew(newReportData);
          }
        }
      }
    } else {
      // Web环境，使用路由导航
      router.push('/')
      
      // 延迟执行以确保先返回首页
      setTimeout(() => {
        if (provider === 'local') {
          // 触发本地生成
          localStorage.setItem('regenerate-report', JSON.stringify({
            provider: 'local',
            date: currentDate
          }))
        } else {
          // 触发AI生成
          localStorage.setItem('regenerate-report', JSON.stringify({
            provider: provider,
            date: currentDate
          }))
        }
      }, 300)
    }
  } catch (error: any) {
    // 如果用户取消，不显示错误
    if (error && error.toString().includes('cancel')) {
      return
    }
    console.error(`[ReportPage] Failed to regenerate report with ${provider}:`, error)
    ElMessage.error(`重新生成报告失败: ${error.message || '未知错误'}`)
  }
}

// 本地生成简洁报告
const generateLocalReport = (tasks: any[], date: string) => {
  // 计算统计数据
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.completed)
  const pendingTasks = tasks.filter(t => !t.completed)
  
  // 生成报告内容
  const content = `# ${date} 工作日报

## 今日完成 (${completedTasks.length}/${totalTasks})

${completedTasks.length > 0 
  ? completedTasks.map(t => `- ${t.title}${t.result ? `\n  _结果: ${t.result}_` : ''}`).join('\n') 
  : '- 今日无完成任务'}

## 未完成 (${pendingTasks.length}/${totalTasks})

${pendingTasks.length > 0 
  ? pendingTasks.map(t => `- ${t.title}`).join('\n') 
  : '- 无未完成任务'}

## 简要总结

- 完成率: ${totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0}%
- 计划任务: ${totalTasks}项
- 已完成: ${completedTasks.length}项
- 未完成: ${pendingTasks.length}项

_此报告由系统自动生成，无需AI_`

  // 创建报告数据
  return {
    title: `${date} 工作日报 (本地生成)`,
    content: content,
    date: date,
    type: 'daily',
    provider: 'local',
    createdAt: Date.now()
  }
}
</script>

<template>
  <div class="report-container">
    <div v-if="isLoading && !isUnmounted" class="loading-container">
      <el-skeleton :rows="15" animated />
    </div>
    
    <div v-else-if="reportData && !isUnmounted" class="report-content">
      <div class="report-header">
        <h1 class="report-title">{{ reportData.title }}</h1>
        <div class="report-meta">
          <div class="report-provider">由 {{ reportData.provider === 'deepseek' ? 'DeepSeek' : reportData.provider === 'openai' ? 'OpenAI' : reportData.provider === 'local' ? '本地' : '模拟数据' }} 生成</div>
          <div class="report-actions">
            <el-button-group class="mr-10">
              <el-button type="success" @click="regenerateReport('local')">
                <el-icon><Document /></el-icon> 本地生成
              </el-button>
              <el-button type="primary" @click="regenerateReport('deepseek')">
                <el-icon><Document /></el-icon> DeepSeek
              </el-button>
              <el-button type="warning" @click="regenerateReport('openai')">
                <el-icon><Document /></el-icon> OpenAI
              </el-button>
            </el-button-group>
            <el-button type="primary" @click="copyReport">
              <el-icon><Document /></el-icon> 复制内容
            </el-button>
          </div>
        </div>
      </div>
      
      <div class="report-body">
        <div class="markdown-content" v-html="formattedContent"></div>
      </div>
    </div>
    
    <div v-else-if="dataLoadError && !isUnmounted" class="no-data">
      <el-empty description="无法加载报告数据">
        <template #extra>
          <el-button type="primary" @click="goBack">
            <el-icon><ArrowLeft /></el-icon> 返回主页
          </el-button>
        </template>
      </el-empty>
    </div>
    
    <div v-else-if="!isUnmounted" class="no-data">
      <el-empty description="无法加载报告数据">
        <template #extra>
          <el-button type="primary" @click="goBack">
            <el-icon><ArrowLeft /></el-icon> 返回主页
          </el-button>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.report-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.loading-container {
  padding: 20px;
}

.report-content {
  background-color: #fff;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.report-header {
  margin-bottom: 30px;
  border-bottom: 1px solid #e4e7ed;
  padding-bottom: 20px;
}

.report-title {
  font-size: 24px;
  margin-bottom: 16px;
  text-align: center;
}

.report-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  flex-wrap: wrap;
}

.report-provider {
  color: #909399;
  font-size: 14px;
}

.report-body {
  line-height: 1.8;
}

.markdown-content {
  white-space: normal;
  line-height: 1.8;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: bold;
}

.markdown-content :deep(h1) {
  font-size: 1.8em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-content :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-content :deep(h3) {
  font-size: 1.3em;
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 2em;
  margin: 0.5em 0;
}

.markdown-content :deep(li) {
  margin: 0.3em 0;
}

.markdown-content :deep(code) {
  background-color: rgba(27, 31, 35, 0.05);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.markdown-content :deep(pre) {
  background-color: #f6f8fa;
  border-radius: 3px;
  padding: 16px;
  overflow: auto;
  margin: 1em 0;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-content :deep(blockquote) {
  margin: 1em 0;
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 1em 0;
  overflow: auto;
  width: 100%;
}

.markdown-content :deep(table th),
.markdown-content :deep(table td) {
  border: 1px solid #dfe2e5;
  padding: 6px 13px;
}

.markdown-content :deep(table tr:nth-child(2n)) {
  background-color: #f6f8fa;
}

.markdown-content :deep(hr) {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8;
  border: 0;
}

.no-data {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}

/* 打印样式 */
@media print {
  .report-actions {
    display: none;
  }
  
  .report-container {
    padding: 0;
  }
  
  .report-content {
    box-shadow: none;
    padding: 0;
  }
}

.mr-10 {
  margin-right: 10px;
}

@media (max-width: 768px) {
  .report-meta {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  
  .report-actions {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .el-button-group {
    width: 100%;
    display: flex;
  }
  
  .el-button-group .el-button {
    flex: 1;
  }
  
  .mr-10 {
    margin-right: 0;
    margin-bottom: 10px;
  }
}
</style> 