<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Calendar,
  Setting,
  Refresh,
  Plus,
  Check,
  Timer,
  Right,
  Delete,
  FolderOpened
} from '@element-plus/icons-vue'
import HistoryPanel from '../components/HistoryPanel.vue'
import { DevTools } from '../testData'
import { useRouter } from 'vue-router'

const router = useRouter()

// 状态
const currentDate = ref(dayjs().format('YYYY-MM-DD'))
const tasks = ref<Task[]>([])
const newTask = ref<{ 
  title: string;
  notes: string;
  dueTime?: number; // Use ? to indicate optional (number | undefined)
  dueTimeValue: null | Date;
}>({ 
  title: '', 
  notes: '', 
  dueTime: undefined,
  dueTimeValue: null 
})
const hasMoreDates = ref(false) // 是否还有更多历史日期可加载
const isLoadingMore = ref(false) // 是否正在加载更多
const showNewTaskForm = ref(false) // 是否显示新任务表单

// 临时截止时间编辑值
const tempDueTime = ref<Date | null>(null)
const editingTaskId = ref<string | null>(null)
const editingTitleTaskId = ref<string | null>(null) // 添加标题编辑状态
const editingTitle = ref<string>('') // 用于编辑标题的临时变量

// 类型定义
interface Task {
  id: string
  title: string
  completed: boolean
  notes: string
  result: string // 添加结果字段
  date: string
  createdAt: number // 创建时间戳
  dueTime?: number // 可选的截止时间（时间戳）
  notesExpanded?: boolean // 详情是否展开
  resultExpanded?: boolean // 结果是否展开
}

// 计算属性
const allHistoryDates = computed(() => {
  // 从任务中提取唯一的日期并排序（最新的在最前面）
  if (!tasks.value) return []
  
  const uniqueDates = [...new Set(tasks.value.map(task => task.date))]
  const result = uniqueDates.sort((a, b) => dayjs(b).unix() - dayjs(a).unix())
  console.log('[HomePage] allHistoryDates:', result.length, result.slice(0, 3))
  return result
})

const recentDates = computed(() => {
  const dates = []
  for (let i = 6; i >= 0; i--) {
    dates.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'))
  }
  return dates
})

const currentTasks = computed(() => {
  // Add defensive checks
  if (!tasks.value) return []
  
  try {
    return tasks.value
      .filter(task => task && typeof task === 'object' && task.date === currentDate.value)
      .sort((a, b) => {
        // First by completion status (uncompleted first)
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        // Then by created timestamp (newest first)
        return b.createdAt - a.createdAt;
      });
  } catch (error) {
    console.error('[HomePage] Error in currentTasks computation:', error);
    return [];
  }
})

// 方法
const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD')
}

const formatDateTime = (timestamp: number) => {
  return dayjs(timestamp).format('HH:mm:ss')
}

const getDueDateStatus = (dueTime?: number) => {
  if (!dueTime) return ''
  
  const now = dayjs()
  const due = dayjs.unix(dueTime)
  
  if (due.isBefore(now)) {
    return 'danger' // 已过期
  } else if (due.diff(now, 'hour') <= 2) {
    return 'warning' // 即将到期（2小时内）
  }
  return 'info' // 正常
}

const isToday = (date: string) => {
  return date === dayjs().format('YYYY-MM-DD')
}

const selectDate = (date: string) => {
  currentDate.value = date
}

const showAddTaskDialog = () => {
  newTask.value = { title: '', notes: '', dueTime: undefined, dueTimeValue: null }
  showNewTaskForm.value = true
}

const addTask = () => {
  if (!newTask.value.title.trim()) {
    ElMessage.warning('请输入目标内容')
    return
  }

  // 使用创建标准化任务结构的函数
  const task = createDefaultTask({
    title: newTask.value.title.trim(),
    notes: newTask.value.notes.trim(),
    result: '',
    completed: false,
    date: currentDate.value,
    dueTime: newTask.value.dueTime
  });

  tasks.value.push(task)
  saveTasks()
  
  // 清空表单并准备添加下一个任务
  newTask.value = { title: '', notes: '', dueTime: undefined, dueTimeValue: null }
  // 不隐藏表单，便于用户继续添加
  ElMessage.success('添加成功')
}

const cancelAddTask = () => {
  newTask.value = { title: '', notes: '', dueTime: undefined, dueTimeValue: null }
  showNewTaskForm.value = false
}

const updateTask = (task: Task) => {
  debouncedSave()
}

const toggleTaskStatus = (task: Task) => {
  task.completed = !task.completed
  debouncedSave()
}

const moveToTomorrow = (task: Task) => {
  // 使用当前选择的日期(task.date)，而不是系统日期
  const selectedDate = dayjs(task.date)
  const tomorrow = selectedDate.add(1, 'day').format('YYYY-MM-DD')
  
  // 检查是否超过7天限制
  const maxAllowedDate = dayjs().add(7, 'day')
  if (dayjs(tomorrow).isAfter(maxAllowedDate)) {
    ElMessage.warning('不能移动超过7天后的目标，请尽快完成当前目标哦~')
    return
  }
  
  // 复制任务到明天，保留截止时间
  const newTask = createDefaultTask({
    ...task,
    id: Date.now().toString(), // 新ID
    date: tomorrow,
    // 不需要指定createdAt，createDefaultTask会设置
  });
  
  // 添加到明天
  tasks.value.push(newTask)
  // 从当前日期移除
  tasks.value = tasks.value.filter(t => t.id !== task.id)
  saveTasks()
  ElMessage.success(`已移动到 ${tomorrow}`)
}

const deleteTask = (task: Task) => {
  ElMessageBox.confirm('确定要删除这个目标吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    tasks.value = tasks.value.filter(t => t.id !== task.id)
    saveTasks()
    ElMessage.success('删除成功')
  })
}

const refreshTasks = () => {
  loadTasks()
  ElMessage.success('刷新成功')
}

// 加载更多历史记录
const loadMoreHistory = () => {
  // 加载更多的逻辑保留，但实际操作由HistoryPanel组件处理
  if (isLoadingMore.value || !hasMoreDates.value) return
  isLoadingMore.value = true
  
  // 模拟加载延迟
  setTimeout(() => {
    isLoadingMore.value = false
    // 更新状态
    hasMoreDates.value = false
  }, 500)
}

// 初始化任务结构，确保所有属性有默认值
const createDefaultTask = (task: Partial<Task>): Task => {
  return {
    id: task.id || Date.now().toString(),
    title: task.title || '',
    notes: task.notes || '',
    result: task.result || '',
    completed: task.completed || false,
    date: task.date || currentDate.value,
    createdAt: task.createdAt || Date.now(),
    dueTime: task.dueTime,
    notesExpanded: task.notesExpanded || false,
    resultExpanded: task.resultExpanded || false
  };
};

// 加载任务时确保所有任务有完整结构
const loadTasks = async () => {
  try {
    if (!window.electronAPI?.store) {
      console.warn('[HomePage] electronAPI or store not available')
      tasks.value = []
      return
    }
    
    const savedTasks = await window.electronAPI.store.get('tasks')
    if (savedTasks && Array.isArray(savedTasks)) {
      // 确保每个任务有完整的结构
      tasks.value = savedTasks.map(task => createDefaultTask(task as Partial<Task>))
      
      // 在任务加载后，等待DOM更新，然后调整文本框高度
      setTimeout(() => {
        adjustAllTextareas()
      }, 200)
    } else {
      tasks.value = []
      await saveTasks()
    }
  } catch (error: any) {
    console.error('[HomePage] Failed to load tasks:', error)
    ElMessage.error(`加载任务失败: ${error.message || '未知错误'}`)
    tasks.value = []
  }
}

// 调整所有文本框高度
const adjustAllTextareas = () => {
  const textareas = document.querySelectorAll('.task-textarea .el-textarea__inner') as NodeListOf<HTMLTextAreaElement>
  textareas.forEach(textarea => {
    // 重置高度
    textarea.style.height = 'auto'
    
    // 设置为内容高度，最大300px
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`
    
    // 确保禁用resize
    textarea.style.resize = 'none'
  })
}

const saveTasks = async () => {
  try {
    if (!window.electronAPI?.store) {
      console.warn('[HomePage] electronAPI or store not available for saving')
      return
    }
    
    // 在保存前将响应式对象转换为普通对象
    const plainTasks = JSON.parse(JSON.stringify(tasks.value))
    const result = await window.electronAPI.store.set('tasks', plainTasks)
    if (!result) {
      throw new Error('保存失败')
    }
  } catch (error: any) {
    console.error('[HomePage] Failed to save tasks:', error)
    ElMessage.error(`保存任务失败: ${error.message || '未知错误'}`)
  }
}

// 自动保存
let saveTimeout: NodeJS.Timeout | null = null
const debouncedSave = () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(async () => {
    await saveTasks()
  }, 1000)
}

// 添加自动保存新任务
const autoSaveTask = () => {
  // 如果标题不为空，则保存
  if (newTask.value.title.trim()) {
    // 使用标准化任务结构创建任务
    const task = createDefaultTask({
      title: newTask.value.title.trim(),
      notes: newTask.value.notes.trim(),
      result: '',
      completed: false,
      date: currentDate.value,
      dueTime: newTask.value.dueTime
    });

    tasks.value.push(task)
    saveTasks()
    
    // 清空表单并准备添加下一个任务
    newTask.value = { title: '', notes: '', dueTime: undefined, dueTimeValue: null }
    ElMessage.success('添加成功')
  } else if (newTask.value.notes.trim() && !newTask.value.title.trim()) {
    // 如果有备注但没有标题，提示用户
    ElMessage.warning('请输入目标内容')
  }
}

// 处理键盘事件
const handleKeyDown = (e: KeyboardEvent) => {
  // 按下Esc键取消添加
  if (e.key === 'Escape' && showNewTaskForm.value) {
    cancelAddTask()
  }
}

const formatTimeFromTimestamp = (timestamp?: number) => {
  if (!timestamp) return ''
  return dayjs.unix(timestamp).format('HH:mm:ss')
}

// 处理截止时间变化
const handleDueTimeChange = (value: Date | null) => {
  if (value) {
    // 转换为当天的时间戳
    const today = dayjs().format('YYYY-MM-DD')
    const time = dayjs(value).format('HH:mm:ss')
    const dateTime = dayjs(`${today} ${time}`).unix()
    newTask.value.dueTime = dateTime
  } else {
    newTask.value.dueTime = undefined
  }
}

// 获取任务的截止时间Date对象
const getDueTimeDate = (task: Task): Date | null => {
  if (!task.dueTime) return null
  return dayjs.unix(task.dueTime).toDate()
}

// 开始编辑任务截止时间
const startEditDueTime = (task: Task) => {
  editingTaskId.value = task.id
  tempDueTime.value = task.dueTime ? getDueTimeDate(task) : null
}

// 更新任务的截止时间
const updateTaskDueTime = (time: Date | null) => {
  if (!editingTaskId.value) return
  
  const task = tasks.value.find(t => t.id === editingTaskId.value)
  if (!task) return
  
  if (time) {
    // 转换为当天的时间戳
    const today = dayjs().format('YYYY-MM-DD')
    const timeString = dayjs(time).format('HH:mm:ss')
    const dateTime = dayjs(`${today} ${timeString}`).unix()
    task.dueTime = dateTime
  } else {
    task.dueTime = undefined
  }
  
  debouncedSave()
}

// 打开设置窗口 - 使用路由导航替代Electron窗口
const openSettings = () => {
  // 首先尝试使用Electron API打开设置窗口
  if (window.electronAPI?.settings) {
    window.electronAPI.settings.open()
      .then(() => {
        console.log('[HomePage] Settings window opened via Electron')
      })
      .catch((error: unknown) => {
        console.error('[HomePage] Failed to open settings window via Electron:', error)
        // 失败后尝试使用路由导航
        router.push('/settings')
      })
  } else {
    // 如果没有Electron API，使用路由导航
    console.log('[HomePage] Using router navigation for settings')
    router.push('/settings')
  }
}

// 生成AI摘要报告
const generateReport = async () => {
  try {
    // 清除之前的临时报告数据（防止缓存过期数据）
    localStorage.removeItem('temp-report-data')
    
    // 检查是否有任务
    if (tasks.value.length === 0) {
      ElMessage.warning('没有任务数据，无法生成报告')
      return
    }
    
    // 检查当前日期是否有任务
    const currentDateTasks = tasks.value.filter(t => t.date === currentDate.value)
    if (currentDateTasks.length === 0) {
      ElMessage.warning(`${currentDate.value} 没有任务数据，无法生成报告`)
      return
    }
    
    // 检查API密钥是否设置
    if (!window.electronAPI?.ai) {
      ElMessage.warning('AI功能不可用，使用模拟报告数据')
      
      // 创建模拟报告数据
      const mockReportData = {
        title: `${currentDate.value} 工作日报`,
        content: `# ${currentDate.value} 工作日报\n\n## 任务完成情况\n\n今天共计划了 ${currentDateTasks.length} 个任务，其中完成了 ${currentDateTasks.filter(t => t.completed).length} 个任务。\n\n## 详细内容\n\n${currentDateTasks.map(t => `- ${t.title}: ${t.completed ? '已完成' : '未完成'}`).join('\n')}\n\n## 总结\n\n这是一份模拟生成的报告，由于AI功能不可用，仅显示基本信息。`,
        date: currentDate.value,
        type: 'daily',
        provider: 'mock',
        createdAt: Date.now()
      }
      
      try {
        // 存储报告数据并使用路由导航
        localStorage.setItem('temp-report-data', JSON.stringify(mockReportData))
        
        // 延迟跳转，确保数据已保存
        setTimeout(() => {
          router.push('/report')
        }, 100)
      } catch (err) {
        console.error('[HomePage] Failed to save mock report data:', err)
        ElMessage.error('保存报告数据失败')
      }
      return
    }
    
    ElMessage.info('正在生成报告，请稍候...')
    
    // 构建提示词
    const tasksForPrompt = currentDateTasks
      .map(t => {
        return `- 任务: ${t.title}\n  状态: ${t.completed ? '已完成' : '未完成'}\n  详情: ${t.notes || '无'}\n  结果: ${t.result || '无'}`
      })
      .join('\n\n')
    
    const prompt = `请根据以下任务列表，生成一份日报总结，包括完成情况分析、存在的问题、以及改进建议：\n\n${tasksForPrompt}`
    
    // 调用AI生成摘要
    // 默认使用DeepSeek，如果失败则尝试OpenAI
    let provider = 'deepseek'
    let reportContent = null
    
    try {
      reportContent = await window.electronAPI.ai.generateSummary(provider, prompt)
    } catch (error) {
      console.error('[HomePage] DeepSeek AI generation failed, trying OpenAI:', error)
      try {
        provider = 'openai'
        reportContent = await window.electronAPI.ai.generateSummary(provider, prompt)
      } catch (innerError) {
        console.error('[HomePage] Both AI providers failed:', innerError)
        throw new Error('所有AI提供商都无法生成报告')
      }
    }
    
    if (!reportContent) {
      throw new Error('生成报告内容为空')
    }
    
    // 创建报告数据
    const reportData = {
      title: `${currentDate.value} 工作日报`,
      content: reportContent,
      date: currentDate.value,
      type: 'daily',
      provider: provider,
      createdAt: Date.now()
    }
    
    // 显示报告
    if (window.electronAPI?.report) {
      try {
        const showResult = await window.electronAPI.report.show(reportData)
        if (!showResult) {
          // 如果展示失败，使用路由导航作为后备方案
          try {
            localStorage.setItem('temp-report-data', JSON.stringify(reportData))
            
            // 延迟跳转，确保数据已保存
            setTimeout(() => {
              router.push('/report')
            }, 100)
          } catch (err) {
            console.error('[HomePage] Failed to save report data:', err)
            ElMessage.error('保存报告数据失败')
          }
        }
      } catch (error) {
        console.error('[HomePage] Failed to show report window:', error)
        // 使用路由导航作为后备方案
        try {
          localStorage.setItem('temp-report-data', JSON.stringify(reportData))
          
          // 延迟跳转，确保数据已保存
          setTimeout(() => {
            router.push('/report')
          }, 100)
        } catch (err) {
          console.error('[HomePage] Failed to save report data after window error:', err)
          ElMessage.error('保存报告数据失败')
        }
      }
    } else {
      // 存储报告数据并使用路由导航
      try {
        localStorage.setItem('temp-report-data', JSON.stringify(reportData))
        
        // 延迟跳转，确保数据已保存
        setTimeout(() => {
          router.push('/report')
        }, 100)
      } catch (err) {
        console.error('[HomePage] Failed to save report data:', err)
        ElMessage.error('保存报告数据失败')
      }
    }
  } catch (error: any) {
    console.error('[HomePage] Failed to generate report:', error)
    ElMessage.error(`生成报告失败: ${error.message || '未知错误'}`)
  }
}

// 编辑任务标题
const editTaskTitle = (task: Task) => {
  editingTitleTaskId.value = task.id
  editingTitle.value = task.title
}

// 保存编辑后的标题
const saveTaskTitle = (task: Task) => {
  if (editingTitle.value.trim()) {
    task.title = editingTitle.value.trim()
    updateTask(task)
  }
  editingTitleTaskId.value = null
}

// 取消编辑标题
const cancelTitleEdit = () => {
  editingTitleTaskId.value = null
}

// 自动调整文本框高度
const autoResizeTextarea = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  // 设置为最小高度
  textarea.style.height = 'auto'
  // 设置为内容高度，最大300px
  textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`
  
  // 直接获取内部实际textarea元素并设置resize属性
  setTimeout(() => {
    const textareaElements = document.querySelectorAll('.el-textarea__inner') as NodeListOf<HTMLTextAreaElement>
    textareaElements.forEach(element => {
      element.style.resize = 'none'
    })
  }, 0)
}

// 在组件挂载时禁用所有textarea的resize
const disableAllTextareaResize = () => {
  const style = document.createElement('style')
  style.innerHTML = `
    .el-textarea__inner {
      resize: none !important;
      overflow-y: hidden;
      min-height: 54px;
      transition: all 0.3s;
    }
  `
  document.head.appendChild(style)
}

// 监听任务内容变化，自动调整高度
watch(() => tasks.value, () => {
  // 当任务数据变化时，延迟执行以确保DOM已更新
  setTimeout(() => {
    const textareas = document.querySelectorAll('.task-textarea .el-textarea__inner') as NodeListOf<HTMLTextAreaElement>
    textareas.forEach(textarea => {
      // 保存当前滚动高度
      const scrollHeight = textarea.scrollHeight;
      
      // 重置高度，然后设置为内容高度
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(scrollHeight, 300)}px`
      
      // 确保禁用resize
      textarea.style.resize = 'none'
    })
  }, 100)
}, { deep: true });

// 生命周期钩子
onMounted(async () => {
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
  
  // 禁用所有textarea的resize
  disableAllTextareaResize()
  
  try {
    // 开发环境标志
    const isDevEnv = !window.electronAPI || window.electronAPI.isDev
    
    // 控制是否加载测试数据的标志 - 设置为false以禁用测试数据
    const LOAD_TEST_DATA = false
    
    console.log('[HomePage] 初始化, 开发环境:', isDevEnv, '加载测试数据:', LOAD_TEST_DATA)
    
    // 如果没有 electronAPI 或在开发环境中
    if (!window.electronAPI) {
      console.warn('[HomePage] electronAPI not found, using mock implementation')
      
      // 创建模拟实现
      window.electronAPI = {
        store: {
          get: async (key: string) => {
            const stored = localStorage.getItem(key)
            return stored ? JSON.parse(stored) : null
          },
          set: async (key: string, value: any) => {
            localStorage.setItem(key, JSON.stringify(value))
            return true
          }
        },
        isDev: true
      }
    }
    
    // 在开发环境中（浏览器或electron开发模式）且开启了测试数据标志时才生成测试数据
    if (isDevEnv && LOAD_TEST_DATA) {
      console.log('[HomePage] 开发环境，生成测试数据')
      const testData = DevTools.generateHistoryData()
      console.log(`[HomePage] 生成了${testData.length}条测试数据`)
      tasks.value = testData
      
      // 保存测试数据
      if (window.electronAPI?.store) {
        window.electronAPI.store.set('tasks', testData)
      }
      return
    }
    
    // 加载任务
    await loadTasks()
  } catch (error: any) {
    console.error('[HomePage] Initialization error:', error)
    ElMessage.error(`初始化失败: ${error.message}`)
  }
})
</script>

<template>
  <div class="app-container">
    <div class="header">
      <div class="title">
        <span class="icon">📋</span> 七日计划
        <div class="actions">
          <el-button type="primary" size="small" @click="refreshTasks">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
          <el-button type="primary" size="small" @click="openSettings">
            <el-icon><Setting /></el-icon> 设置
          </el-button>
          <el-button type="success" size="small" @click="generateReport">
            <el-icon><FolderOpened /></el-icon> 生成日报
          </el-button>
        </div>
      </div>
    </div>
    
    <div class="main-content">
      <div class="sidebar">
        <HistoryPanel 
          :current-date="currentDate || ''"
          :all-dates="Array.isArray(allHistoryDates) ? allHistoryDates : []"
          :is-loading="isLoadingMore"
          :has-more="hasMoreDates"
          @select-date="selectDate"
          @load-more="loadMoreHistory"
        />
      </div>

      <div class="content">
        <div class="date-header">
          <div class="current-date">
            <el-icon><Calendar /></el-icon>
            {{ formatDate(currentDate) }}
            <span v-if="isToday(currentDate)" class="today-mark">(今日)</span>
          </div>
          <el-button type="primary" @click="showAddTaskDialog" v-if="!showNewTaskForm">
            <el-icon><Plus /></el-icon> 添加新目标
          </el-button>
        </div>

        <el-scrollbar class="tasks-container">
          <div class="task-list">
            <!-- 新目标表单 -->
            <el-card v-if="showNewTaskForm" class="task-item new-task-form">
              <div class="task-header">
                <el-input
                  v-model="newTask.title"
                  placeholder="请输入目标内容 (Enter键保存)"
                  class="new-task-title"
                  autofocus
                  @keyup.enter="autoSaveTask"
                />
              </div>
              
              <div class="task-notes">
                <div class="content-label">详情：</div>
                <el-input
                  v-model="newTask.notes"
                  type="textarea"
                  :rows="3"
                  placeholder="添加详情...(失焦时自动保存)"
                  @blur="autoSaveTask"
                  class="task-textarea"
                />
              </div>
              
              <div class="task-due-date">
                <span class="due-date-label">截止时间（可选）：</span>
                <el-time-picker
                  v-model="newTask.dueTimeValue"
                  format="HH:mm:ss"
                  placeholder="选择截止时间"
                  @change="handleDueTimeChange"
                />
              </div>

              <div class="task-actions">
                <el-button-group>
                  <el-button 
                    type="primary" 
                    @click="addTask"
                  >
                    保存并继续
                  </el-button>
                  <el-button 
                    @click="cancelAddTask"
                  >
                    取消 (Esc)
                  </el-button>
                </el-button-group>
              </div>
            </el-card>

            <el-card v-for="task in currentTasks" :key="task.id" class="task-item" :class="{'task-item-completed': task.completed}">
              <div class="task-header">
                <el-checkbox 
                  v-model="task.completed"
                  @change="updateTask(task)"
                >
                  <span 
                    v-if="editingTitleTaskId !== task.id"
                    class="task-title" 
                    :class="{ 'completed': task.completed }"
                    @click.stop="editTaskTitle(task)"
                  >
                    {{ task.title }}
                    <el-tag v-if="task.completed" size="small" type="success" class="completed-tag">已完成</el-tag>
                  </span>
                  <el-input
                    v-else
                    v-model="editingTitle"
                    class="task-title-input"
                    :class="{ 'completed': task.completed }"
                    @blur="saveTaskTitle(task)"
                    @keyup.enter="saveTaskTitle(task)"
                    @keyup.esc="cancelTitleEdit"
                    placeholder="输入目标内容"
                    autofocus
                  />
                </el-checkbox>
                
                <div class="task-actions">
                  <el-button-group>
                    <el-tooltip content="移至明天" placement="top" effect="light">
                      <el-button 
                        v-if="!task.completed" 
                        size="small" 
                        @click="moveToTomorrow(task)"
                      >
                        <el-icon><Right /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="删除任务" placement="top" effect="light">
                      <el-button 
                        size="small" 
                        @click="deleteTask(task)"
                      >
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </el-tooltip>
                  </el-button-group>
                </div>
              </div>

              <div v-if="task.dueTime" class="task-due-time">
                截止时间: {{ formatTimeFromTimestamp(task.dueTime) }}
                <el-button 
                  size="small" 
                  type="text" 
                  @click="startEditDueTime(task)"
                >
                  修改
                </el-button>
                <el-time-picker
                  v-if="editingTaskId === task.id"
                  v-model="tempDueTime"
                  format="HH:mm:ss"
                  placeholder="选择新的截止时间"
                  @change="updateTaskDueTime"
                />
              </div>

              <div class="task-content">
                <div class="task-content-row">
                  <div class="task-details">
                    <div class="content-label">
                      详情：
                      <el-button 
                        v-if="task.notes && task.notes.length > 100" 
                        type="text" 
                        size="small" 
                        class="expand-button"
                        @click="task.notesExpanded = !task.notesExpanded"
                      >
                        {{ task.notesExpanded ? '收起' : '展开' }}
                      </el-button>
                    </div>
                    <el-input
                      v-model="task.notes"
                      type="textarea"
                      :rows="task.notesExpanded ? 10 : 3"
                      placeholder="添加详情内容..."
                      class="task-textarea"
                      :class="{'expanded': task.notesExpanded}"
                      @input="autoResizeTextarea"
                      @change="updateTask(task)"
                      @focus="autoResizeTextarea"
                    />
                  </div>
                  
                  <div class="task-results">
                    <div class="content-label">
                      结果：
                      <el-button 
                        v-if="task.result && task.result.length > 100" 
                        type="text" 
                        size="small" 
                        class="expand-button"
                        @click="task.resultExpanded = !task.resultExpanded"
                      >
                        {{ task.resultExpanded ? '收起' : '展开' }}
                      </el-button>
                    </div>
                    <el-input
                      v-model="task.result"
                      type="textarea"
                      :rows="task.resultExpanded ? 10 : 3"
                      placeholder="记录完成结果..."
                      class="task-textarea"
                      :class="{'expanded': task.resultExpanded}"
                      @input="autoResizeTextarea"
                      @change="updateTask(task)"
                      @focus="autoResizeTextarea"
                    />
                  </div>
                </div>
              </div>
            </el-card>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
}

.header {
  background-color: #fff;
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 18px;
  font-weight: bold;
}

.icon {
  margin-right: 8px;
}

.actions {
  display: flex;
  gap: 8px;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 250px;
  background-color: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.date-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.current-date {
  font-size: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-mark {
  color: #409eff;
  margin-left: 4px;
}

.tasks-container {
  flex: 1;
  overflow: hidden;
}

.task-list {
  padding: 8px;
}

.task-item {
  margin-bottom: 16px;
}

.task-header {
  margin-bottom: 8px;
}

.completed {
  text-decoration: line-through;
  color: #909399;
}

.task-notes {
  margin: 8px 0;
}

.task-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.el-button-group {
  display: flex;
  gap: 8px;
}

.el-menu-item {
  display: flex;
  align-items: center;
}

.el-menu-item .el-icon {
  margin-right: 8px;
}

.new-task-form {
  border-left: 3px solid #409eff;
}

.new-task-title {
  font-weight: bold;
  margin-bottom: 8px;
}

.task-due-date {
  margin: 8px 0;
}

.due-date-label {
  margin-right: 8px;
}

.task-time-info {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
}

.task-due-date-tag {
  margin-top: 8px;
}

.due-date-warning {
  color: #E6A23C;
}

.due-date-danger {
  color: #F56C6C;
}

.due-date-editor {
  padding: 5px;
}

.task-title-input {
  width: 100%;
  font-size: 16px;
  font-weight: 500;
}

.task-title.completed {
  text-decoration: line-through;
  color: #909399;
}

.task-content {
  margin-top: 16px;
}

.task-content-row {
  display: flex;
  gap: 16px;
}

.task-details, .task-results {
  flex: 1;
  width: 50%;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  padding: 12px;
  transition: all 0.3s ease;
  border: 1px solid #ebeef5;
  overflow: hidden;
}

.task-details:hover, .task-results:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.content-label {
  font-weight: bold;
  margin-bottom: 8px;
  color: #409EFF;
  font-size: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.expand-button {
  padding: 0 4px;
  font-size: 12px;
}

.task-textarea {
  width: 100%;
  max-height: 150px; 
  overflow-y: auto;
  resize: none;
  line-height: 1.5;
  border: none;
  background-color: #fafafa;
  border-radius: 4px;
  padding: 8px;
  box-sizing: border-box;
  transition: all 0.3s ease;
}

.task-textarea.expanded {
  max-height: 300px;
}

.task-textarea:focus {
  background-color: #ffffff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.task-title {
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.task-title:hover {
  text-decoration: underline;
  color: #409EFF;
}

.task-title.completed {
  text-decoration: line-through;
  color: #909399;
}

.completed-tag {
  margin-left: 8px;
}

.task-item-completed {
  background-color: #f5f5f5;
  border-left: 3px solid #67c23a;
  opacity: 0.85;
}
</style> 