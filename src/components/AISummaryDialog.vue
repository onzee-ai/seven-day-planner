<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MarkdownIt from 'markdown-it'

// 创建markdown解析器实例
const md = new MarkdownIt({
  html: true,      // 允许HTML标签
  breaks: true,    // 将\n转换为<br>
  linkify: true    // 将URL转换为链接
})

// 接口定义
interface Task {
  id: string
  title: string
  completed: boolean
  notes: string
  date: string
  createdAt: number
  dueTime?: number
}

interface Summary {
  id: string
  date: string
  type: string
  title: string
  content: string
  provider: string
  createdAt: number
}

// 定义props
const props = defineProps<{
  modelValue: boolean, // v-model绑定值
  date: string, // 当前要总结的日期
  summaryType: 'day' | 'week' | 'month' | 'quarter' | 'year' // 总结类型
}>()

// 定义事件
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const router = useRouter()
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// 状态
const selectedProvider = ref<'deepseek' | 'openai'>('deepseek')
const summaryResult = ref<string>('')
const isGenerating = ref(false)
const summaryExists = ref(false)
const summaryId = ref<string>('')

// 计算属性
const summaryTypeName = computed(() => {
  switch (props.summaryType) {
    case 'day': return '日报'
    case 'week': return '周报'
    case 'month': return '月报'
    case 'quarter': return '季度报告'
    case 'year': return '年度报告'
    default: return '报告'
  }
})

const summaryTitle = computed(() => {
  const dateStr = formatDateByType(props.date, props.summaryType)
  return `${dateStr} ${summaryTypeName.value}`
})

// 格式化Markdown内容
const formattedContent = computed(() => {
  if (!summaryResult.value) return ''
  return md.render(summaryResult.value)
})

// 日期格式化方法
const formatDateByType = (date: string, type: string) => {
  const d = dayjs(date)
  switch (type) {
    case 'day':
      return d.format('YYYY年MM月DD日')
    case 'week':
      return `${d.format('YYYY年MM月')}第${Math.ceil(d.date() / 7)}周`
    case 'month':
      return d.format('YYYY年MM月')
    case 'quarter':
      return `${d.format('YYYY年')}Q${Math.ceil((d.month() + 1) / 3)}`
    case 'year':
      return d.format('YYYY年')
    default:
      return d.format('YYYY-MM-DD')
  }
}

// 根据总结类型获取开始日期
const getStartDate = (date: string, type: string) => {
  const d = dayjs(date)
  switch (type) {
    case 'day':
      return d.startOf('day').subtract(1, 'second') // 提前1秒确保包含整天
    case 'week':
      return d.startOf('week').subtract(1, 'second')
    case 'month':
      return d.startOf('month').subtract(1, 'second')
    case 'quarter':
      const quarterStartMonth = Math.floor(d.month() / 3) * 3
      return d.month(quarterStartMonth).startOf('month').subtract(1, 'second')
    case 'year':
      return d.startOf('year').subtract(1, 'second')
    default:
      return d.subtract(1, 'second')
  }
}

// 根据总结类型获取结束日期
const getEndDate = (date: string, type: string) => {
  const d = dayjs(date)
  switch (type) {
    case 'day':
      return d.endOf('day').add(1, 'second') // 延后1秒确保包含整天
    case 'week':
      return d.endOf('week').add(1, 'second')
    case 'month':
      return d.endOf('month').add(1, 'second')
    case 'quarter':
      const quarterStartMonth = Math.floor(d.month() / 3) * 3
      return d.month(quarterStartMonth + 2).endOf('month').add(1, 'second')
    case 'year':
      return d.endOf('year').add(1, 'second')
    default:
      return d.add(1, 'second')
  }
}

// 获取该时间段的任务数据
const getTasksByTimeRange = async (): Promise<Task[]> => {
  if (!window.electronAPI?.store) {
    return []
  }

  try {
    const allTasks = await window.electronAPI.store.get('tasks') || []
    if (!Array.isArray(allTasks) || allTasks.length === 0) {
      return []
    }

    const startDate = getStartDate(props.date, props.summaryType)
    const endDate = getEndDate(props.date, props.summaryType)
    
    console.log('[AISummaryDialog] 查找时间范围:', 
      startDate.format('YYYY-MM-DD HH:mm:ss'), 
      '至', 
      endDate.format('YYYY-MM-DD HH:mm:ss'),
      '找到任务:', allTasks.length)

    // 使用任务的日期字符串进行比较，而不是时间戳
    return allTasks.filter((task: Task) => {
      const taskDate = dayjs(task.date)
      // 只包含当前时间范围内的任务，并且排除移动到明天的任务
      return taskDate.isAfter(startDate) && 
        taskDate.isBefore(endDate) &&
        // 确保任务未被移动到其他日期（通过检查createdAt和日期的匹配关系）
        // 如果任务是在其创建日期的那天，就认为它是原始任务而不是移动后的任务
        dayjs(task.date).format('YYYY-MM-DD') === dayjs.unix(task.createdAt/1000).format('YYYY-MM-DD');
    })
  } catch (error) {
    console.error('[AISummaryDialog] Failed to get tasks:', error)
    return []
  }
}

// 生成AI提示词
const generatePrompt = async (tasks: Task[]): Promise<string> => {
  const timeRangeText = formatDateByType(props.date, props.summaryType)
  
  let prompt = `请根据以下${timeRangeText}的任务记录，生成一份详细的${summaryTypeName.value}。
分析这段时间内的任务完成情况，包括完成了哪些任务，未完成的任务有哪些，并对工作/学习进行总结评价。
提供对未来工作的建议和改进方向。
生成的报告应当语言流畅，逻辑清晰，包含数据分析和洞察。
避免空泛的表扬，而是基于具体任务数据提供有价值的总结和建议。

任务记录（JSON格式）：
${JSON.stringify(tasks, null, 2)}

任务字段说明：
- id: 任务唯一标识
- title: 任务标题
- completed: 是否已完成
- notes: 任务备注
- date: 任务日期
- createdAt: 创建时间戳
- dueTime: 截止时间戳（可选）

请以Markdown格式输出，包含标题、总览、详细分析、完成情况统计和建议等章节。`;

  return prompt
}

// 检查API密钥是否已配置
const checkAPIKey = async (): Promise<boolean> => {
  if (!window.electronAPI?.apiKeys) {
    ElMessage.error('API功能不可用')
    return false
  }

  try {
    const providerName = selectedProvider.value
    const apiKey = await window.electronAPI.apiKeys.get(providerName)
    
    if (!apiKey) {
      ElMessage.warning(`未配置${providerName === 'deepseek' ? 'DeepSeek' : 'OpenAI'} API密钥，请先在设置中配置`)
      router.push('/settings')
      visible.value = false
      return false
    }
    
    return true
  } catch (error) {
    console.error('[AISummaryDialog] Failed to check API key:', error)
    ElMessage.error('检查API密钥失败')
    return false
  }
}

// 生成总结
const generateSummary = async (): Promise<void> => {
  if (isGenerating.value) return
  
  // 检查API密钥
  const isKeyConfigured = await checkAPIKey()
  if (!isKeyConfigured) return
  
  isGenerating.value = true
  summaryResult.value = ''
  
  try {
    // 获取任务数据
    const tasks = await getTasksByTimeRange()
    if (tasks.length === 0) {
      ElMessage.warning('该时间段内没有任务记录')
      isGenerating.value = false
      return
    }
    
    // 生成提示词
    const prompt = await generatePrompt(tasks)
    
    // 调用AI接口生成总结
    if (!window.electronAPI?.ai) {
      throw new Error('AI功能不可用')
    }
    
    // 使用选择的提供商生成总结
    const result = await window.electronAPI.ai.generateSummary(
      selectedProvider.value,
      prompt
    )
    
    // 设置结果
    summaryResult.value = result
    
    // 保存生成的总结
    await saveSummary()
    
    summaryExists.value = true
    ElMessage.success('总结生成成功')
  } catch (error: any) {
    console.error('[AISummaryDialog] Failed to generate summary:', error)
    ElMessage.error(`生成总结失败: ${error.message || '未知错误'}`)
  } finally {
    isGenerating.value = false
  }
}

// 监听日期和类型变化
watch([() => props.date, () => props.summaryType], async (newVal, oldVal) => {
  console.log('[AISummaryDialog] 日期或类型变化:', oldVal, '->', newVal)
  
  // 强制重新加载摘要，无论之前的状态如何
  summaryId.value = '' // 清空ID，确保重新查找
  summaryExists.value = false
  summaryResult.value = '' // 清空结果，避免显示旧内容
  
  // 使用setTimeout确保DOM更新后再加载，避免竞态条件
  setTimeout(async () => {
    await loadSavedSummary()
  }, 100)
}, { immediate: true })

// 加载已保存的总结
const loadSavedSummary = async (): Promise<void> => {
  if (!window.electronAPI?.store) {
    return
  }

  try {
    // 获取已保存的总结
    const summaries: Summary[] = await window.electronAPI.store.get('summaries') || []
    console.log(`[AISummaryDialog] 加载总结数据，找到${summaries.length}条记录，当前日期:${props.date}, 类型:${props.summaryType}`)
    
    if (summaries.length === 0) {
      summaryResult.value = ''
      summaryExists.value = false
      return
    }
    
    // 查找当前日期和类型的总结
    const savedSummary = summaries.find((s: Summary) => 
      s.date === props.date && s.type === props.summaryType
    )
    
    console.log('[AISummaryDialog] 找到匹配的总结:', savedSummary ? '是' : '否', 
                '日期:', props.date, '类型:', props.summaryType)
    
    if (savedSummary) {
      console.log('[AISummaryDialog] 加载摘要内容:', savedSummary.id)
      summaryResult.value = savedSummary.content
      summaryExists.value = true
      summaryId.value = savedSummary.id
      selectedProvider.value = savedSummary.provider as 'deepseek' | 'openai'
    } else {
      console.log('[AISummaryDialog] 未找到匹配的摘要，清空显示')
      summaryResult.value = ''
      summaryExists.value = false
      summaryId.value = ''
    }
  } catch (error) {
    console.error('[AISummaryDialog] Failed to load saved summary:', error)
    summaryResult.value = ''
    summaryExists.value = false
    summaryId.value = ''
  }
}

// 保存总结
const saveSummary = async (): Promise<void> => {
  if (!window.electronAPI?.store) {
    return
  }

  try {
    // 获取已保存的总结
    const summaries: Summary[] = await window.electronAPI.store.get('summaries') || []
    
    // 检查是否已存在相同日期和类型的总结
    const existingIndex = summaries.findIndex(s => 
      s.date === props.date && s.type === props.summaryType
    )
    
    const summaryID = existingIndex >= 0 
      ? summaries[existingIndex].id 
      : `${props.summaryType}-${props.date}-${Date.now()}`
    
    // 创建新的总结记录
    const newSummary: Summary = {
      id: summaryID,
      date: props.date,
      type: props.summaryType,
      title: summaryTitle.value,
      content: summaryResult.value,
      provider: selectedProvider.value,
      createdAt: Date.now()
    }
    
    // 如果已存在，则替换；否则添加
    if (existingIndex >= 0) {
      summaries[existingIndex] = newSummary
      console.log(`[AISummaryDialog] 更新已存在的总结, ID:${summaryID}, 日期:${props.date}, 类型:${props.summaryType}`)
    } else {
      summaries.push(newSummary)
      console.log(`[AISummaryDialog] 添加新的总结, ID:${summaryID}, 日期:${props.date}, 类型:${props.summaryType}`)
    }
    
    // 保存总结
    const saveResult = await window.electronAPI.store.set('summaries', summaries)
    console.log(`[AISummaryDialog] 保存总结数据结果:${saveResult}, 共${summaries.length}条记录`)
    
    // 记录当前总结ID
    summaryId.value = summaryID
    summaryExists.value = true
  } catch (error) {
    console.error('[AISummaryDialog] Failed to save summary:', error)
  }
}

// 复制总结内容
const copySummary = () => {
  if (!summaryResult.value) {
    ElMessage.warning('没有内容可复制')
    return
  }
  
  // 创建一个临时元素来保存纯文本内容
  const el = document.createElement('textarea')
  el.value = summaryResult.value
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
  
  ElMessage.success('已复制到剪贴板')
}

// 组件挂载时加载保存的总结
onMounted(async () => {
  console.log('[AISummaryDialog] 组件挂载，加载总结')
  await loadSavedSummary()
})
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="summaryTitle"
    width="80%"
    :close-on-click-modal="false"
    :close-on-press-escape="!isGenerating"
    :fullscreen="false"
    top="5vh"
    append-to-body
    destroy-on-close
  >
    <div class="summary-dialog-content">
      <div class="summary-options" v-if="!summaryExists && !isGenerating">
        <div class="provider-selector">
          <span class="provider-label">选择AI模型：</span>
          <el-radio-group v-model="selectedProvider">
            <el-radio label="deepseek">DeepSeek</el-radio>
            <el-radio label="openai">OpenAI</el-radio>
          </el-radio-group>
        </div>
        
        <el-alert
          title="提示：生成总结需要消耗API调用额度，请确保您的API密钥有足够的额度。"
          type="info"
          show-icon
          :closable="false"
          class="api-notice"
        />
        
        <div class="generate-btn-container">
          <el-button 
            type="primary" 
            @click="generateSummary" 
            :loading="isGenerating"
          >
            生成{{ summaryTypeName }}
          </el-button>
        </div>
      </div>
      
      <div v-if="isGenerating" class="generating-status">
        <el-skeleton :rows="10" animated />
        <div class="generating-text">
          正在使用{{ selectedProvider === 'deepseek' ? 'DeepSeek' : 'OpenAI' }} AI生成{{ summaryTypeName }}，请稍候...
        </div>
      </div>
      
      <div v-if="summaryResult" class="summary-result">
        <div class="summary-header">
          <div class="summary-provider-info">
            由 {{ selectedProvider === 'deepseek' ? 'DeepSeek' : 'OpenAI' }} AI 生成
          </div>
          <el-button 
            type="primary" 
            size="small"
            @click="copySummary"
            icon="Document"
          >
            复制内容
          </el-button>
        </div>
        <div class="markdown-content" v-html="formattedContent"></div>
      </div>
    </div>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="visible = false" :disabled="isGenerating">关闭</el-button>
        <el-button v-if="summaryExists" type="primary" @click="generateSummary" :loading="isGenerating">
          重新生成
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<style scoped>
.summary-dialog-content {
  min-height: 300px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 0 10px;
}

.summary-options {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 20px 0;
}

.provider-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.provider-label {
  font-weight: bold;
  flex-shrink: 0;
}

.api-notice {
  margin: 10px 0;
}

.generate-btn-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.generating-status {
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.generating-text {
  text-align: center;
  margin-top: 20px;
  color: #409eff;
  font-weight: bold;
}

.summary-result {
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.summary-provider-info {
  color: #909399;
  font-size: 12px;
}

.markdown-content {
  white-space: normal;
  line-height: 1.6;
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
</style> 