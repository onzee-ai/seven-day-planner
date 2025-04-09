<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
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
  FolderOpened,
  ArrowUp,
  ArrowDown
} from '@element-plus/icons-vue'
import HistoryPanel from '../components/HistoryPanel.vue'
// 仅在开发环境中导入测试数据工具
import { DevTools } from '../testData'
// @ts-ignore
import { useRouter } from 'vue-router'
import AISummaryDialog from '../components/AISummaryDialog.vue'

const router = useRouter()

// 在文件顶部添加日志控制变量
const isDevMode = import.meta.env.DEV;

// 创建自定义日志函数，只在开发模式下输出日志
const log = (message: string, ...args: any[]) => {
  if (isDevMode) {
    console.log(`[HomePage] ${message}`, ...args);
  }
};

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
const showTaskList = ref(true) // 目标列表默认展开

// 临时截止时间编辑值
const tempDueTime = ref<Date | null>(null)
const editingTaskId = ref<string | null>(null)
const editingTitleTaskId = ref<string | null>(null) // 添加标题编辑状态
const editingTitle = ref<string>('') // 用于编辑标题的临时变量

const aiSummaryDialogVisible = ref(false) // 添加控制AISummaryDialog显示的变量
const summaryDate = ref('') // 添加当前总结的日期
const summaryType = ref<'day' | 'week' | 'month' | 'quarter' | 'year'>('day') // 添加总结类型
// 设置相关变量
const settingsDialogVisible = ref(false) // 设置对话框是否显示
const settingsActiveTab = ref('general') // 设置对话框当前激活的标签
const targetApiProvider = ref<'deepseek' | 'openai'>('deepseek') // 目标API提供商

// 添加一个新的 ref 变量来追踪最近添加的任务
const recentlyAddedTaskId = ref<string | null>(null);

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
  log('allHistoryDates:', result.length, result.slice(0, 3))
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

// 添加两个计算属性，分别获取未完成和已完成的任务
const pendingTasks = computed(() => {
  return currentTasks.value.filter(task => !task.completed)
})

const completedTasks = computed(() => {
  return currentTasks.value.filter(task => task.completed)
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
  
  // 设置最近添加的任务ID
  recentlyAddedTaskId.value = task.id
  
  // 1秒后移除高亮效果
  setTimeout(() => {
    recentlyAddedTaskId.value = null
  }, 1000)
  
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

const handleTaskStatusChange = (task: Task) => {
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

// 修改 autoSaveTask 函数
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
    
    // 设置最近添加的任务ID
    recentlyAddedTaskId.value = task.id
    
    // 1秒后移除高亮效果
    setTimeout(() => {
      recentlyAddedTaskId.value = null
    }, 1000)
    
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
  if (window.electronAPI?.settings) {
    // 使用electronAPI打开设置窗口
    window.electronAPI.settings.open()
    log('Settings window opened via Electron')
  } else {
    // 使用路由导航到设置页面
    router.push('/settings')
    log('Using router navigation for settings')
  }
}

// 修改查看报告函数
const viewReport = async () => {
  try {
    // 设置当前日期和总结类型
    summaryDate.value = currentDate.value
    summaryType.value = 'day' // 日报类型
    
    // 显示总结对话框
    aiSummaryDialogVisible.value = true
  } catch (error: any) {
    console.error('[HomePage] Failed to view report:', error)
    ElMessage.error(`查看报告失败: ${error.message || '未知错误'}`)
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
    // 判断是否为开发环境
    const isDevEnv = import.meta.env.DEV || (window.electronAPI?.isDev ?? false)
    
    // 开发环境标志：是否加载测试数据
    const LOAD_TEST_DATA = false // 改成true会在每次启动时生成新的测试数据
    
    log('初始化, 开发环境:', isDevEnv, '加载测试数据:', LOAD_TEST_DATA)
    
    // 在开发环境中（浏览器或electron开发模式）且开启了测试数据标志时才生成测试数据
    if (isDevEnv && LOAD_TEST_DATA) {
      log('开发环境，生成测试数据')
      const testData = DevTools.generateHistoryData()
      log(`生成了${testData.length}条测试数据`)
      tasks.value = testData
      
      // 保存测试数据
      if (window.electronAPI?.store) {
        window.electronAPI.store.set('tasks', testData)
      }
      return
    }
    
    // 加载任务
    await loadTasks()

    // 添加自定义报告选择按钮样式
    const style = document.createElement('style')
    style.innerHTML = `
      .report-options-dialog .el-message-box__btns {
        justify-content: center;
        padding-top: 20px;
        display: flex;
        flex-wrap: wrap;
      }
      .ai-model-btn {
        margin: 10px 5px !important;
        min-width: 120px;
      }
      .ai-model-btn.deepseek {
        background-color: #9254de;
        border-color: #9254de;
        color: white;
      }
      .ai-model-btn.openai {
        background-color: #10b981;
        border-color: #10b981;
        color: white;
      }
      .ai-model-btn.local {
        background-color: #409eff;
        border-color: #409eff;
        color: white;
      }
      .cancel-btn {
        margin: 10px 5px !important;
        min-width: 120px;
      }
    `
    document.head.appendChild(style)

    // 不再需要注入的操作，因为我们直接查看报告而不是弹出选择框
  } catch (error: any) {
    console.error('[HomePage] Initialization error:', error)
    ElMessage.error(`初始化失败: ${error.message}`)
  }
})

// 添加openSettingsModal方法
const openSettingsModal = (provider: 'deepseek' | 'openai') => {
  // 隐藏当前的Summary对话框
  aiSummaryDialogVisible.value = false
  
  // 显示设置对话框
  settingsDialogVisible.value = true
  
  // 设置初始选中的标签为API设置
  settingsActiveTab.value = 'apis'
  
  // 设置目标提供商，以便可以聚焦到相应的输入框
  targetApiProvider.value = provider
  
  // 确保下一个渲染周期后设置焦点
  nextTick(() => {
    // 尝试聚焦到对应的输入框
    const inputId = `${provider}-api-key-input`
    const inputElement = document.getElementById(inputId)
    if (inputElement) {
      inputElement.focus()
    }
  })
}
</script>

<template>
  <div class="app-container">
    <div class="header">
      <div class="title">
        <span class="icon">📋</span> 七日计划
        <div class="actions">
          <el-button type="primary" size="small" @click="openSettings">
            <el-icon><Setting /></el-icon> 设置
          </el-button>
          <el-button type="success" size="small" @click="viewReport">
            <el-icon><FolderOpened /></el-icon> 查看日报
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

        <!-- 任务汇总区域（紧凑型） -->
        <div class="task-summary">
          <el-card shadow="hover" :body-style="{ padding: '10px' }">
            <div class="summary-compact">
              <div class="summary-stats-compact">
                <div class="stat-item-compact">
                  <div class="stat-value">{{ 
                    Array.isArray(currentTasks) ? 
                    currentTasks.filter(t => !t.completed).length : 0 
                  }}</div>
                  <div class="stat-label">待办</div>
                </div>
                <div class="stat-item-compact">
                  <div class="stat-value">{{ 
                    Array.isArray(currentTasks) ? 
                    currentTasks.filter(t => t.completed).length : 0 
                  }}</div>
                  <div class="stat-label">已完成</div>
                </div>
                <div class="stat-item-compact">
                  <div class="stat-value">{{ 
                    Array.isArray(currentTasks) && currentTasks.length > 0 ? 
                    Math.round((currentTasks.filter(t => t.completed).length / currentTasks.length) * 100) + '%' : 
                    '0%' 
                  }}</div>
                  <div class="stat-label">完成率</div>
                </div>
                
                <el-button 
                  type="text" 
                  size="small" 
                  class="toggle-list-btn"
                  @click="showTaskList = !showTaskList"
                >
                  {{ showTaskList ? '收起目标列表' : '展开目标列表' }}
                  <el-icon>
                    <component :is="showTaskList ? 'ArrowUp' : 'ArrowDown'" />
                  </el-icon>
                </el-button>
              </div>
              
              <el-progress 
                class="summary-progress-compact"
                :percentage="
                  Array.isArray(currentTasks) && currentTasks.length > 0 ? 
                  Math.round((currentTasks.filter(t => t.completed).length / currentTasks.length) * 100) : 
                  0
                "
                :stroke-width="8"
                :format="() => ''"
                :status="
                  (Array.isArray(currentTasks) && currentTasks.length > 0 && 
                   currentTasks.filter(t => t.completed).length === currentTasks.length) ? 
                  'success' : ''
                "
              />
              
              <div v-if="showTaskList" class="task-list-compact">
                <div v-if="!Array.isArray(currentTasks) || currentTasks.length === 0" class="no-tasks">
                  今日暂无目标，点击"添加新目标"开始规划您的一天
                </div>
                <div v-else class="task-list-columns">
                  <!-- 左侧：未完成任务 -->
                  <div class="task-column">
                    <div class="column-header">
                      <span class="column-title">待办</span>
                      <span class="task-count">{{ Array.isArray(currentTasks) ? currentTasks.filter(t => !t.completed).length : 0 }}</span>
                    </div>
                    <div class="column-content">
                      <div 
                        v-for="task in pendingTasks" 
                        :key="task.id" 
                        class="task-item-compact"
                      >
                        <el-checkbox 
                          v-model="task.completed" 
                          @change="handleTaskStatusChange(task)"
                        >
                          <span>{{ task.title || '无标题' }}</span>
                        </el-checkbox>
                      </div>
                      <div v-if="pendingTasks.length === 0" class="column-empty">
                        无待办任务
                      </div>
                    </div>
                  </div>
                  
                  <!-- 右侧：已完成任务 -->
                  <div class="task-column">
                    <div class="column-header">
                      <span class="column-title">已完成</span>
                      <span class="task-count">{{ Array.isArray(currentTasks) ? currentTasks.filter(t => t.completed).length : 0 }}</span>
                    </div>
                    <div class="column-content">
                      <div 
                        v-for="task in completedTasks" 
                        :key="task.id" 
                        class="task-item-compact completed-item"
                      >
                        <el-checkbox 
                          v-model="task.completed" 
                          @change="handleTaskStatusChange(task)"
                          class="completed-task"
                        >
                          <span class="completed-text">{{ task.title || '无标题' }}</span>
                        </el-checkbox>
                      </div>
                      <div v-if="completedTasks.length === 0" class="column-empty">
                        无已完成任务
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
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

            <el-card 
              v-for="task in currentTasks" 
              :key="task.id" 
              class="task-item" 
              :class="{
                'task-item-completed': task.completed,
                'task-item-highlight': task.id === recentlyAddedTaskId
              }"
            >
              <div class="task-header">
                <div class="task-title-row">
                  <el-checkbox 
                    v-model="task.completed"
                    @change="handleTaskStatusChange(task)"
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
                  
                  <div class="task-actions inline-actions">
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

    <!-- 添加AISummaryDialog组件 -->
    <AISummaryDialog 
      :modelVisible="aiSummaryDialogVisible"
      @update:modelVisible="aiSummaryDialogVisible = $event"
      :date="summaryDate"
      :summaryType="summaryType"
      @open-settings="openSettingsModal"
    />
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

.task-summary {
  margin: 5px 0 10px 0;
}

.summary-compact {
  display: flex;
  flex-direction: column;
}

.summary-stats-compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5px;
}

.stat-item-compact {
  text-align: center;
  flex: 1;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: #409EFF;
  line-height: 1;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.toggle-list-btn {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
}

.summary-progress-compact {
  margin: 8px 0;
}

.task-list-compact {
  /* 移除最大高度限制和滚动条 */
  /* max-height: 150px; */
  /* overflow-y: auto; */
  border-top: 1px solid #f0f0f0;
  margin-top: 5px;
  padding-top: 5px;
}

.task-item-compact {
  padding: 4px 0;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 13px;
}

.task-item-compact:last-child {
  border-bottom: none;
}

.no-tasks {
  text-align: center;
  color: #909399;
  padding: 8px 0;
  font-size: 12px;
}

.completed-task {
  opacity: 0.7;
}

.completed-text {
  text-decoration: line-through;
  color: #909399;
}

.task-list-columns {
  display: flex;
  gap: 10px;
}

.task-column {
  flex: 1;
  min-width: 0; /* 防止flex子项溢出 */
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background-color: #fafafa;
}

.column-header {
  padding: 6px 8px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column-title {
  font-weight: 600;
  color: #606266;
}

.task-count {
  background-color: #ecf5ff;
  color: #409EFF;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 11px;
}

.column-content {
  padding: 5px 8px;
  /* 移除最大高度限制和滚动条 */
  /* max-height: 80px; */
  /* overflow-y: auto; */
}

.completed-item {
  opacity: 0.8;
}

.column-empty {
  text-align: center;
  color: #909399;
  font-size: 12px;
  padding: 8px 0;
  font-style: italic;
}

@media (max-width: 768px) {
  .summary-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .summary-stats {
    width: 100%;
    justify-content: space-between;
  }
}

.task-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.inline-actions {
  margin-top: 0;
  margin-left: 8px;
}

.task-item-highlight {
  background-color: #E6F7FF; /* 淡蓝色背景 */
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.4); /* 蓝色阴影 */
  transition: all 1s ease-out; /* 更慢的淡出效果 */
  border-left: 3px solid #409EFF; /* 蓝色左边框 */
  animation: highlight-pulse 1s ease-in-out; /* 添加脉冲动画 */
}

/* 添加脉冲动画效果 */
@keyframes highlight-pulse {
  0% { 
    background-color: #E6F7FF; 
    box-shadow: 0 0 5px rgba(64, 158, 255, 0.3);
  }
  50% { 
    background-color: #E1F5FE; 
    box-shadow: 0 0 15px rgba(64, 158, 255, 0.5);
  }
  100% { 
    background-color: #E6F7FF; 
    box-shadow: 0 0 12px rgba(64, 158, 255, 0.4);
  }
}
</style> 