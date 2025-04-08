<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import {
  Calendar,
  FolderOpened,
  ArrowDown,
  Reading
} from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import AISummaryDialog from './AISummaryDialog.vue'

// 定义props
const props = defineProps<{
  currentDate: string
  allDates: string[]
  isLoading: boolean
  hasMore: boolean
}>()

// 提供默认值
const safeCurrentDate = computed(() => props.currentDate || '')
const safeAllDates = computed(() => {
  if (!props.allDates || !Array.isArray(props.allDates)) {
    console.warn('[HistoryPanel] allDates is not an array')
    return []
  }
  return props.allDates
})

// 定义事件
const emit = defineEmits<{
  (e: 'select-date', date: string): void
  (e: 'load-more'): void
}>()

// 状态
const groupedHistory = ref<HistoryGroup[]>([])
const expandedGroups = ref<string[]>([]) // 存储已展开的分组ID
const displayDates = ref<string[]>([]) // 当前显示的日期列表（当前周和最近7天）
const showSummaryDialog = ref(false) // 控制AI总结对话框的显示
const summaryDate = ref('') // 当前正在总结的日期
const summaryType = ref<'day' | 'week' | 'month' | 'quarter' | 'year'>('day') // 总结类型

// 历史记录分组类型
interface HistoryGroup {
  id: string
  type: 'week' | 'month' | 'quarter' | 'year'
  title: string
  dates: string[]
  subGroups?: HistoryGroup[]
}

// 计算最近7天的日期
const recentDates = computed(() => {
  const dates = []
  for (let i = 6; i >= 0; i--) {
    dates.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'))
  }
  return dates
})

// 是否当前星期
const isCurrentWeek = (date: string) => {
  const startOfWeek = dayjs().startOf('week')
  const endOfWeek = dayjs().endOf('week')
  return dayjs(date).isAfter(startOfWeek) && dayjs(date).isBefore(endOfWeek)
}

// 是否当天
const isToday = (date: string) => {
  return date === dayjs().format('YYYY-MM-DD')
}

// 获取日期所属的周
const getWeekOfMonth = (date: string) => {
  return Math.ceil(dayjs(date).date() / 7)
}

// 获取日期所属的月份
const getMonth = (date: string) => {
  return dayjs(date).month() + 1 // dayjs 的月份从 0 开始
}

// 获取日期所属的季度
const getQuarter = (date: string) => {
  const month = getMonth(date)
  return Math.ceil(month / 3)
}

// 获取日期所属的年份
const getYear = (date: string) => {
  return dayjs(date).year()
}

// 格式化日期
const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD')
}

// 判断是否应该展开组
const shouldExpandGroup = (groupId: string) => {
  if (!groupId || !expandedGroups.value || !Array.isArray(expandedGroups.value)) {
    return false;
  }
  return expandedGroups.value.includes(groupId)
}

// 切换组展开状态
const toggleGroupExpand = (groupId: string) => {
  const index = expandedGroups.value.indexOf(groupId)
  if (index > -1) {
    expandedGroups.value.splice(index, 1)
  } else {
    expandedGroups.value.push(groupId)
  }
}

// 选择日期
const selectDate = (date: string) => {
  emit('select-date', date)
}

// 加载更多
const loadMore = () => {
  emit('load-more')
}

// 检查API密钥是否配置
const checkAPIKeysConfigured = async (providerName: string) => {
  if (!window.electronAPI?.apiKeys) {
    ElMessage.error('API功能不可用')
    return false
  }

  try {
    const apiKey = await window.electronAPI.apiKeys.get(providerName)
    return !!apiKey
  } catch (error) {
    console.error(`[HistoryPanel] Failed to check ${providerName} API key:`, error)
    return false
  }
}

// 打开AI总结对话框
const openSummaryDialog = async (date: string, type: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'day') => {
  summaryDate.value = date
  summaryType.value = type
  showSummaryDialog.value = true
}

// 打开按日期的AI总结
const openDaySummary = async (date: string) => {
  openSummaryDialog(date, 'day')
}

// 打开按分组的AI总结
const openGroupSummary = async (group: HistoryGroup) => {
  // Safety check for group
  if (!group || !group.dates || !Array.isArray(group.dates)) {
    ElMessage.warning('该分组没有任务记录')
    return
  }
  
  // 使用组中的第一个日期作为参考日期
  const date = group.dates[0] || ''
  if (!date) {
    ElMessage.warning('该分组没有任务记录')
    return
  }
  
  openSummaryDialog(date, group.type)
}

// 组织历史记录分组
const organizeHistoryGroups = (dates: string[]) => {
  // 安全检查
  if (!dates || !Array.isArray(dates) || dates.length === 0) {
    groupedHistory.value = []
    return
  }
  
  // 按年分组
  const yearGroups: {[key: string]: string[]} = {}
  
  dates.forEach(date => {
    if (!date) return; // 忽略空日期
    
    try {
      const year = getYear(date).toString()
      if (!yearGroups[year]) {
        yearGroups[year] = []
      }
      yearGroups[year].push(date)
    } catch (err) {
      console.error(`[HistoryPanel] Error processing date: ${date}`, err)
    }
  })
  
  // 转换为HistoryGroup结构
  const years: HistoryGroup[] = Object.keys(yearGroups)
    .sort((a, b) => parseInt(b) - parseInt(a))
    .map(year => {
      const yearDates = yearGroups[year]
      
      // 按季度分组
      const quarterGroups: {[key: string]: string[]} = {}
      
      yearDates.forEach(date => {
        const quarter = `Q${getQuarter(date)}`
        if (!quarterGroups[quarter]) {
          quarterGroups[quarter] = []
        }
        quarterGroups[quarter].push(date)
      })
      
      // 创建季度分组
      const quarters = Object.keys(quarterGroups)
        .sort((a, b) => {
          // 按Q1, Q2, Q3, Q4排序
          return parseInt(b.replace('Q', '')) - parseInt(a.replace('Q', ''))
        })
        .map(quarter => {
          const quarterDates = quarterGroups[quarter]
          
          // 按月分组
          const monthGroups: {[key: string]: string[]} = {}
          
          quarterDates.forEach(date => {
            const month = `${getMonth(date)}月`
            if (!monthGroups[month]) {
              monthGroups[month] = []
            }
            monthGroups[month].push(date)
          })
          
          // 创建月份分组
          const months = Object.keys(monthGroups)
            .sort((a, b) => {
              // 按月份数字排序
              return parseInt(b.replace('月', '')) - parseInt(a.replace('月', ''))
            })
            .map(month => {
              const monthDates = monthGroups[month]
              
              // 按周分组
              const weekGroups: {[key: string]: string[]} = {}
              
              monthDates.forEach(date => {
                const week = `${month}第${getWeekOfMonth(date)}周`
                if (!weekGroups[week]) {
                  weekGroups[week] = []
                }
                weekGroups[week].push(date)
              })
              
              // 创建周分组
              const weeks = Object.keys(weekGroups)
                .sort((a, b) => {
                  // 提取周数进行排序
                  const weekA = parseInt(a.match(/第(\d+)周/)?.[1] || '0')
                  const weekB = parseInt(b.match(/第(\d+)周/)?.[1] || '0')
                  return weekB - weekA
                })
                .map(week => {
                  return {
                    id: `week-${month}-${week}`,
                    type: 'week' as const,
                    title: week,
                    dates: weekGroups[week].sort((a, b) => dayjs(b).unix() - dayjs(a).unix())
                  }
                })
              
              return {
                id: `month-${year}-${month}`,
                type: 'month' as const,
                title: month,
                dates: monthDates,
                subGroups: weeks
              }
            })
          
          return {
            id: `quarter-${year}-${quarter}`,
            type: 'quarter' as const,
            title: quarter,
            dates: quarterDates,
            subGroups: months
          }
        })
      
      return {
        id: `year-${year}`,
        type: 'year' as const,
        title: `${year}年`,
        dates: yearDates,
        subGroups: quarters
      }
    })
  
  groupedHistory.value = years
}

// 修改初始化方法，接受日期列表参数
const initDateGroups = (dates: string[] = []) => {
  // 安全检查，确保我们有一个数组
  if (!Array.isArray(dates)) {
    console.warn('[HistoryPanel] dates is not an array in initDateGroups')
    dates = []
  }
  
  // 当前周日期（只有当前周的日期才显示在顶层）
  const currentWeekDates = dates.filter(date => 
    isCurrentWeek(date) || isToday(date)
  )
  
  // 设置显示日期为当前周日期
  displayDates.value = [...new Set(currentWeekDates)]
    .sort((a, b) => dayjs(b).unix() - dayjs(a).unix())
  
  // 对历史日期进行分组（所有非当前周的日期）
  organizeHistoryGroups(dates.filter(date => 
    !isCurrentWeek(date) && !isToday(date)
  ))
}

// 监听props变化，重新初始化分组
watch(() => safeAllDates.value, (newDates) => {
  console.log('[HistoryPanel] allDates changed:', newDates.length)
  
  // 检查并添加当天日期，确保即使没有任务也始终显示当天
  let dates = [...newDates]
  const today = dayjs().format('YYYY-MM-DD')
  
  // 如果当前日期不在列表中，添加它
  if (!dates.includes(today)) {
    dates.push(today)
    console.log('[HistoryPanel] Added today to dates')
  }
  
  // 使用包含当天的日期列表初始化分组
  initDateGroups(dates)
}, { immediate: true })
</script>

<template>
  <div class="history-panel">
    <div class="history-title">历史记录</div>
    <el-scrollbar>
      <el-menu :default-active="safeCurrentDate">
        <!-- 当前星期的日期和当天 -->
        <el-menu-item 
          v-for="date in displayDates" 
          :key="date" 
          :index="date"
          @click="selectDate(date)"
        >
          <el-icon><Calendar /></el-icon>
          <span>{{ formatDate(date) }}</span>
          <span v-if="isToday(date)" class="today-mark">(今日)</span>
          <el-button
            class="ai-summary-btn"
            type="text"
            size="small"
            @click.stop="openDaySummary(date)"
          >
            <el-icon><Reading /></el-icon>
            总结
          </el-button>
        </el-menu-item>
        
        <!-- 分组历史记录 -->
        <template v-for="yearGroup in groupedHistory" :key="yearGroup.id">
          <!-- 年份分组 -->
          <div class="history-group year-group">
            <div 
              class="group-header" 
              @click="toggleGroupExpand(yearGroup.id)"
            >
              <el-icon><FolderOpened /></el-icon>
              <span>{{ yearGroup.title }}</span>
              <span class="expand-icon">{{ shouldExpandGroup(yearGroup.id) ? '▼' : '▶' }}</span>
              <el-button
                class="ai-summary-btn"
                type="text"
                size="small"
                @click.stop="openGroupSummary(yearGroup)"
              >
                <el-icon><Reading /></el-icon>
                年报
              </el-button>
            </div>
            
            <!-- 季度分组 -->
            <div v-if="shouldExpandGroup(yearGroup.id)" class="subgroups">
              <template v-for="quarterGroup in (yearGroup.subGroups || [])" :key="quarterGroup.id">
                <div class="history-group quarter-group">
                  <div 
                    class="group-header" 
                    @click="toggleGroupExpand(quarterGroup.id)"
                  >
                    <el-icon><FolderOpened /></el-icon>
                    <span>{{ quarterGroup.title }}</span>
                    <span class="expand-icon">{{ shouldExpandGroup(quarterGroup.id) ? '▼' : '▶' }}</span>
                    <el-button
                      class="ai-summary-btn"
                      type="text"
                      size="small"
                      @click.stop="openGroupSummary(quarterGroup)"
                    >
                      <el-icon><Reading /></el-icon>
                      季报
                    </el-button>
                  </div>
                  
                  <!-- 月份分组 -->
                  <div v-if="shouldExpandGroup(quarterGroup.id)" class="subgroups">
                    <template v-for="monthGroup in (quarterGroup.subGroups || [])" :key="monthGroup.id">
                      <div class="history-group month-group">
                        <div 
                          class="group-header" 
                          @click="toggleGroupExpand(monthGroup.id)"
                        >
                          <el-icon><FolderOpened /></el-icon>
                          <span>{{ monthGroup.title }}</span>
                          <span class="expand-icon">{{ shouldExpandGroup(monthGroup.id) ? '▼' : '▶' }}</span>
                          <el-button
                            class="ai-summary-btn"
                            type="text"
                            size="small"
                            @click.stop="openGroupSummary(monthGroup)"
                          >
                            <el-icon><Reading /></el-icon>
                            月报
                          </el-button>
                        </div>
                        
                        <!-- 周分组 -->
                        <div v-if="shouldExpandGroup(monthGroup.id)" class="subgroups">
                          <template v-for="weekGroup in (monthGroup.subGroups || [])" :key="weekGroup.id">
                            <div class="history-group week-group">
                              <div 
                                class="group-header" 
                                @click="toggleGroupExpand(weekGroup.id)"
                              >
                                <el-icon><FolderOpened /></el-icon>
                                <span>{{ weekGroup.title }}</span>
                                <span class="expand-icon">{{ shouldExpandGroup(weekGroup.id) ? '▼' : '▶' }}</span>
                                <el-button
                                  class="ai-summary-btn"
                                  type="text"
                                  size="small"
                                  @click.stop="openGroupSummary(weekGroup)"
                                >
                                  <el-icon><Reading /></el-icon>
                                  周报
                                </el-button>
                              </div>
                              
                              <!-- 日期列表 -->
                              <div v-if="shouldExpandGroup(weekGroup.id)" class="subgroups">
                                <el-menu-item 
                                  v-for="date in (weekGroup.dates || [])" 
                                  :key="date" 
                                  :index="date"
                                  @click="selectDate(date)"
                                  class="date-item"
                                >
                                  <el-icon><Calendar /></el-icon>
                                  <span>{{ formatDate(date) }}</span>
                                  <el-button
                                    class="ai-summary-btn"
                                    type="text"
                                    size="small"
                                    @click.stop="openDaySummary(date)"
                                  >
                                    <el-icon><Reading /></el-icon>
                                    总结
                                  </el-button>
                                </el-menu-item>
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
        
        <div v-if="hasMore" class="load-more-container">
          <el-button 
            type="text" 
            :loading="isLoading" 
            @click="loadMore"
            class="load-more-btn"
          >
            <el-icon><ArrowDown /></el-icon> 加载更多历史记录
          </el-button>
        </div>
      </el-menu>
    </el-scrollbar>
    
    <!-- AI总结对话框 -->
    <AISummaryDialog
      v-if="showSummaryDialog"
      v-model="showSummaryDialog"
      :date="summaryDate"
      :summary-type="summaryType"
    />
  </div>
</template>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.history-title {
  padding: 16px;
  font-weight: bold;
  border-bottom: 1px solid #e4e7ed;
}

.today-mark {
  color: #409eff;
  margin-left: 4px;
}

/* 历史记录分组样式 */
.history-group {
  margin: 4px 0;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
  border-radius: 4px;
  transition: background-color 0.3s;
  min-height: 36px;
  flex-wrap: nowrap;
  position: relative;
}

.group-header:hover {
  background-color: #f5f7fa;
}

.group-header .el-icon {
  margin-right: 8px;
  flex-shrink: 0;
}

.group-header > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expand-icon {
  margin-left: auto;
  margin-right: 8px;
  flex-shrink: 0;
}

.subgroups {
  margin-left: 16px;
  border-left: 1px solid #e4e7ed;
}

.year-group > .group-header {
  color: #409eff;
}

.quarter-group > .group-header {
  color: #67c23a;
}

.month-group > .group-header {
  color: #e6a23c;
}

.week-group > .group-header {
  color: #909399;
}

.date-item {
  font-size: 0.9em;
  padding-left: 30px !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* AI总结按钮样式 */
.ai-summary-btn {
  margin-left: auto;
  display: none;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 窄屏幕下仅显示图标 */
@media (max-width: 768px) {
  .ai-summary-btn ::v-deep(.el-button-content span) {
    display: none;
  }
}

.el-menu-item:hover .ai-summary-btn,
.group-header:hover .ai-summary-btn {
  display: inline-flex;
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
</style> 