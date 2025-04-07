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
  ArrowDown
} from '@element-plus/icons-vue'

// 状态
const currentDate = ref(dayjs().format('YYYY-MM-DD'))
const tasks = ref<Task[]>([])
const newTask = ref({ 
  title: '', 
  notes: '', 
  dueTime: undefined,
  dueTimeValue: null 
})
const displayDates = ref<string[]>([]) // 当前显示的日期列表
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
  return uniqueDates.sort((a, b) => dayjs(b).unix() - dayjs(a).unix())
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

// 初始化显示日期，只显示最近7天
const initDisplayDates = () => {
  // 首先获取最近7天的日期
  const last7Days = recentDates.value
  
  // 然后获取所有历史日期
  const allDates = allHistoryDates.value
  
  // 初始化显示日期为最近7天中有任务的日期加上最近有任务的7天
  const recentWithTasks = allDates.filter(date => {
    return dayjs(date).isAfter(dayjs().subtract(7, 'day').startOf('day'))
  })
  
  // 合并并去重
  const combined = [...new Set([...last7Days, ...recentWithTasks])]
  
  // 排序（最新的在前）
  displayDates.value = combined.sort((a, b) => dayjs(b).unix() - dayjs(a).unix())
  
  // 检查是否还有更多历史日期
  hasMoreDates.value = allDates.length > displayDates.value.length
}

// 加载更多历史记录
const loadMoreHistory = () => {
  if (isLoadingMore.value || !hasMoreDates.value) return
  
  isLoadingMore.value = true
  
  // 获取当前显示的最早日期
  const earliestDisplayedDate = displayDates.value[displayDates.value.length - 1]
  
  // 获取更早的7天日期
  const olderDates = allHistoryDates.value.filter(date => {
    return dayjs(date).isBefore(dayjs(earliestDisplayedDate))
  }).slice(0, 7)
  
  // 将新日期添加到显示列表中
  displayDates.value = [...displayDates.value, ...olderDates]
  
  // 更新是否还有更多日期
  hasMoreDates.value = allHistoryDates.value.length > displayDates.value.length
  
  isLoadingMore.value = false
}

// 数据持久化
const loadTasks = async () => {
  try {
    console.log('[App] Attempting to load tasks...')
    if (!window.electronAPI?.store?.get) {
      console.error('[App] electronAPI not available during loadTasks')
      throw new Error('electronAPI 未正确初始化')
    }
    const savedTasks = await window.electronAPI.store.get('tasks')
    console.log('[App] Loaded tasks:', savedTasks)
    if (savedTasks && Array.isArray(savedTasks)) {
      tasks.value = savedTasks as Task[]
      // 初始化显示日期
      initDisplayDates()
    } else {
      console.log('[App] No saved tasks found, initializing empty array')
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
    console.log('[App] Attempting to save tasks...')
    if (!window.electronAPI?.store?.set) {
      console.error('[App] electronAPI not available during saveTasks')
      throw new Error('electronAPI 未正确初始化')
    }
    console.log('[App] Saving tasks:', tasks.value)
    
    // 在保存前将响应式对象转换为普通对象
    const plainTasks = JSON.parse(JSON.stringify(tasks.value))
    console.log('[App] Converting to plain object before saving')
    
    const result = await window.electronAPI.store.set('tasks', plainTasks)
    if (!result) {
      console.error('[App] Save operation returned false')
      throw new Error('保存失败')
    }
    console.log('[App] Tasks saved successfully')
    
    // 当任务变化时，更新显示的日期列表
    initDisplayDates()
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
    }
  }
}

// 生命周期钩子
onMounted(async () => {
  console.log('[App] Component mounted')
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
  
  // 简单直接的初始化方法
  const init = async () => {
    try {
      console.log('[App] Waiting for electronAPI...')
      
      // 如果没有 electronAPI，创建一个模拟版本以便开发测试
      if (!window.electronAPI) {
        console.warn('[App] electronAPI not found, using mock implementation')
        // 创建模拟实现
        window.electronAPI = {
          store: {
            get: async (key: string) => {
              console.log('[Mock] Getting', key)
              const stored = localStorage.getItem(key)
              return stored ? JSON.parse(stored) : null
            },
            set: async (key: string, value: any) => {
              console.log('[Mock] Setting', key, value)
              localStorage.setItem(key, JSON.stringify(value))
              return true
            }
          }
        }
      } else {
        console.log('[App] Real electronAPI found')
      }
      
      // 加载任务
      await loadTasks()
    } catch (error: any) {
      console.error('[App] Initialization error:', error)
      ElMessage.error(`初始化失败: ${error.message}`)
    }
  }
  
  await init()
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
        <div class="history-title">历史记录</div>
        <el-scrollbar>
          <el-menu :default-active="currentDate">
            <el-menu-item 
              v-for="date in displayDates" 
              :key="date" 
              :index="date"
              @click="selectDate(date)"
            >
              <el-icon><Calendar /></el-icon>
              <span>{{ formatDate(date) }}</span>
              <span v-if="isToday(date)" class="today-mark">(今日)</span>
            </el-menu-item>
            
            <div v-if="hasMoreDates" class="load-more-container">
              <el-button 
                type="text" 
                :loading="isLoadingMore" 
                @click="loadMoreHistory"
                class="load-more-btn"
              >
                <el-icon><ArrowDown /></el-icon> 加载更多历史记录
              </el-button>
            </div>
          </el-menu>
        </el-scrollbar>
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
                        @change="time => updateTaskDueTime(time)"
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
  width: 200px;
  background-color: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.history-title {
  padding: 16px;
  font-weight: bold;
  border-bottom: 1px solid #e4e7ed;
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

/* 加载更多按钮样式 */
.load-more-container {
  padding: 10px;
  text-align: center;
  border-top: 1px solid #e4e7ed;
}

.load-more-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.load-more-btn .el-icon {
  margin-right: 4px;
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
