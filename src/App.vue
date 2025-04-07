<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
import HistoryPanel from './components/HistoryPanel.vue'
import { DevTools } from './testData'

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

// 类型定义
interface Task {
  id: string
  title: string
  completed: boolean
  notes: string
  date: string
  createdAt: number // 创建时间戳
  dueTime?: number // 可选的截止时间（时间戳）
}

// 计算属性
const allHistoryDates = computed(() => {
  // 从任务中提取唯一的日期并排序（最新的在最前面）
  const uniqueDates = [...new Set(tasks.value.map(task => task.date))]
  const result = uniqueDates.sort((a, b) => dayjs(b).unix() - dayjs(a).unix())
  console.log('[App] allHistoryDates:', result.length, result.slice(0, 3))
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
  return tasks.value
    .filter(task => task.date === currentDate.value)
    .sort((a, b) => b.createdAt - a.createdAt) // 按创建时间倒序排序
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

  const task: Task = {
    id: Date.now().toString(),
    title: newTask.value.title.trim(),
    notes: newTask.value.notes.trim(),
    completed: false,
    date: currentDate.value,
    createdAt: Date.now(),
    dueTime: newTask.value.dueTime
  }

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
  const newTask: Task = {
    ...task,
    id: Date.now().toString(),
    date: tomorrow,
    createdAt: Date.now()
  }
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

// 数据持久化
const loadTasks = async () => {
  try {
    const savedTasks = await window.electronAPI.store.get('tasks')
    if (savedTasks && Array.isArray(savedTasks)) {
      tasks.value = savedTasks as Task[]
    } else {
      tasks.value = []
      await saveTasks()
    }
  } catch (error: any) {
    console.error('[App] Failed to load tasks:', error)
    ElMessage.error(`加载任务失败: ${error.message || '未知错误'}`)
    tasks.value = []
  }
}

const saveTasks = async () => {
  try {
    // 在保存前将响应式对象转换为普通对象
    const plainTasks = JSON.parse(JSON.stringify(tasks.value))
    const result = await window.electronAPI.store.set('tasks', plainTasks)
    if (!result) {
      throw new Error('保存失败')
    }
  } catch (error: any) {
    console.error('[App] Failed to save tasks:', error)
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
    const task: Task = {
      id: Date.now().toString(),
      title: newTask.value.title.trim(),
      notes: newTask.value.notes.trim(),
      completed: false,
      date: currentDate.value,
      createdAt: Date.now(),
      dueTime: newTask.value.dueTime
    }

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

// 为 window.electronAPI 添加类型声明
declare global {
  interface Window {
    electronAPI: {
      store: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<boolean>
      }
      isDev?: boolean  // 添加可选的isDev属性
    }
  }
}

// 生命周期钩子
onMounted(async () => {
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
  
  try {
    // 开发环境标志
    const isDevEnv = !window.electronAPI || window.electronAPI.isDev
    
    // 控制是否加载测试数据的标志 - 设置为false以禁用测试数据
    const LOAD_TEST_DATA = false
    
    console.log('[App] 初始化, 开发环境:', isDevEnv, '加载测试数据:', LOAD_TEST_DATA)
    
    // 如果没有 electronAPI 或在开发环境中
    if (!window.electronAPI) {
      console.warn('[App] electronAPI not found, using mock implementation')
      
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
      console.log('[App] 开发环境，生成测试数据')
      const testData = DevTools.generateHistoryData()
      console.log(`[App] 生成了${testData.length}条测试数据`)
      tasks.value = testData
      
      // 保存测试数据
      window.electronAPI.store.set('tasks', testData)
      return
    }
    
    // 加载任务
    await loadTasks()
  } catch (error: any) {
    console.error('[App] Initialization error:', error)
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
          <el-button type="primary" size="small">
            <el-icon><Setting /></el-icon> 设置
          </el-button>
        </div>
      </div>
    </div>
    
    <div class="main-content">
      <div class="sidebar">
        <HistoryPanel 
          :current-date="currentDate"
          :all-dates="allHistoryDates"
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
                <el-input
                  v-model="newTask.notes"
                  type="textarea"
                  :rows="2"
                  placeholder="添加备注...(失焦时自动保存)"
                  @blur="autoSaveTask"
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

            <el-card v-for="task in currentTasks" :key="task.id" class="task-item">
              <div class="task-header">
                <el-checkbox 
                  v-model="task.completed"
                  @change="updateTask(task)"
                >
                  <span :class="{ completed: task.completed }">{{ task.title }}</span>
                </el-checkbox>
              </div>
              
              <div class="task-notes" v-if="task.notes">
                <el-input
                  v-model="task.notes"
                  type="textarea"
                  :rows="2"
                  placeholder="添加备注..."
                  @change="updateTask(task)"
                />
              </div>
              
              <!-- 时间信息显示 -->
              <div class="task-time-info">
                <span>创建时间: {{ formatDateTime(task.createdAt) }}</span>
                
                <div>
                  <el-popover
                    placement="top"
                    width="auto"
                    trigger="click"
                  >
                    <template #reference>
                      <el-tag 
                        v-if="task.dueTime" 
                        size="small"
                        :type="getDueDateStatus(task.dueTime)"
                        class="task-due-date-tag"
                        style="cursor: pointer"
                        @click="startEditDueTime(task)"
                      >
                        截止时间: {{ formatTimeFromTimestamp(task.dueTime) }}
                      </el-tag>
                      <el-button v-else type="text" size="small" @click="startEditDueTime(task)">
                        设置截止时间
                      </el-button>
                    </template>
                    
                    <div class="due-date-editor">
                      <el-time-picker
                        v-model="tempDueTime"
                        format="HH:mm:ss"
                        placeholder="选择截止时间"
                        @change="updateTaskDueTime"
                      />
                    </div>
                  </el-popover>
                </div>
              </div>

              <div class="task-actions">
                <el-button-group>
                  <el-button 
                    :type="task.completed ? 'success' : 'primary'"
                    size="small"
                    @click="toggleTaskStatus(task)"
                  >
                    <el-icon><Check v-if="task.completed" /><Timer v-else /></el-icon>
                    {{ task.completed ? '已完成' : '未完成' }}
                  </el-button>
                  <el-button 
                    type="warning" 
                    size="small"
                    @click="moveToTomorrow(task)"
                  >
                    <el-icon><Right /></el-icon>
                    移动至明天
                  </el-button>
                  <el-button 
                    type="danger" 
                    size="small"
                    @click="deleteTask(task)"
                  >
                    <el-icon><Delete /></el-icon>
                    废弃
                  </el-button>
                </el-button-group>
              </div>
            </el-card>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </div>
</template>

<style>
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
</style>