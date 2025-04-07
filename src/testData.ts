import dayjs from 'dayjs'

// 生成测试任务类型
export interface TestTask {
  id: string
  title: string
  completed: boolean
  notes: string
  date: string
  createdAt: number
  dueTime?: number
}

// 生成指定日期的任务
const generateTaskForDate = (date: string, index: number): TestTask => {
  const createdAt = dayjs(date).unix() + index
  return {
    id: `task-${date}-${index}`,
    title: `测试任务 ${date} #${index}`,
    completed: Math.random() > 0.7,
    notes: `这是 ${date} 的测试任务#${index}，用于测试历史记录分组功能`,
    date,
    createdAt,
    dueTime: Math.random() > 0.5 ? createdAt + 3600 : undefined
  }
}

// 生成过去六个月的历史任务数据
export const generateHistoryData = (): TestTask[] => {
  const tasks: TestTask[] = []
  
  // 生成当前月和过去5个月的数据
  for (let monthsAgo = 0; monthsAgo <= 5; monthsAgo++) {
    // 每个月生成3-5周的数据
    for (let week = 1; week <= Math.floor(Math.random() * 3) + 3; week++) {
      // 每周生成3-5天的数据
      for (let day = 1; day <= Math.floor(Math.random() * 3) + 3; day++) {
        const randomOffset = Math.floor(Math.random() * 7) // 每周内随机一天
        const date = dayjs()
          .subtract(monthsAgo, 'month') // 过去X个月
          .subtract(week, 'week') // 过去X周
          .add(randomOffset, 'day') // 随机日期偏移
          .format('YYYY-MM-DD')
          
        // 每天生成2-5个任务
        const taskCount = Math.floor(Math.random() * 4) + 2
        for (let i = 1; i <= taskCount; i++) {
          tasks.push(generateTaskForDate(date, i))
        }
      }
    }
  }
  
  // 最近7天的数据
  for (let i = 0; i < 7; i++) {
    const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    const taskCount = Math.floor(Math.random() * 4) + 2 // 2-5个任务
    for (let j = 1; j <= taskCount; j++) {
      tasks.push(generateTaskForDate(date, j))
    }
  }
  
  console.log('[TestData] 生成测试数据:', tasks.length, '条记录')
  return tasks
}

// 将测试数据存入localStorage
export const loadTestData = (): void => {
  const testTasks = generateHistoryData()
  try {
    localStorage.setItem('tasks', JSON.stringify(testTasks))
    console.log(`已生成${testTasks.length}条测试数据`)
  } catch (error) {
    console.error('保存测试数据失败:', error)
  }
}

// 清除测试数据
export const clearTestData = (): void => {
  try {
    localStorage.removeItem('tasks')
    console.log('已清除测试数据')
  } catch (error) {
    console.error('清除测试数据失败:', error)
  }
}

// 方便开发者使用的开发工具对象
export const DevTools = {
  loadTestData,
  clearTestData,
  generateHistoryData
} 