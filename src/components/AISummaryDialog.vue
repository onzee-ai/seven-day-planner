<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, watchEffect } from 'vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElButton, ElAlert, ElDialog, ElRadioGroup, ElRadioButton, ElEmpty, ElSkeleton, ElBadge, ElButtonGroup } from 'element-plus'
import MarkdownIt from 'markdown-it'
import axios from 'axios'

// @ts-ignore
import { generateLocalSummary } from '../utils/reportGenerator'

// Define local types
interface Task {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  date: string;
  priority?: 'low' | 'medium' | 'high';
}

interface Summary {
  id: string;
  date: string;
  type: 'day' | 'week' | 'month' | 'quarter' | 'year';
  title: string;
  content: string;
  provider: 'local' | 'deepseek' | 'openai';
  createdAt: number;
}

// 创建markdown解析器实例
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
})

// 定义props
const props = defineProps<{
  date: string,
  summaryType: 'day' | 'week' | 'month' | 'quarter' | 'year',
  modelVisible: boolean
}>()

// 定义事件
const emit = defineEmits<{
  (e: 'update:modelVisible', value: boolean): void,
  (e: 'open-settings', provider: 'deepseek' | 'openai'): void
}>()

// 使用类型断言
const router = useRouter()
const visible = computed({
  get: () => props.modelVisible,
  set: (val) => emit('update:modelVisible', val)
})

// 状态管理
const selectedProvider = ref<'local' | 'deepseek' | 'openai'>('local')
const isGenerating = ref(false)
const activeReport = ref<'local' | 'deepseek' | 'openai'>('local')

// 控制任务详情展开/折叠
const expandedTasks = ref<Set<number>>(new Set())
const allExpanded = ref(false)

// 解决TypeScript报错：强类型化reports对象
type ReportData = { content: string; id: string; createdAt: number } | null;
type ReportType = 'local' | 'deepseek' | 'openai';

// 定义报告集合对象，提供类型信息
const reports = ref<Record<ReportType, ReportData>>({
  local: null,
  deepseek: null,
  openai: null
})

// 映射提供商名称
const providerNames: Record<ReportType, string> = {
  local: '本地生成',
  deepseek: 'DeepSeek',
  openai: 'OpenAI'
}

const hasReports = computed(() => Object.values(reports.value).some(report => report !== null))

// 报告相关计算属性
const reportTypeName = computed(() => {
  switch (props.summaryType) {
    case 'day': return '日报'
    case 'week': return '周报'
    case 'month': return '月报'
    case 'quarter': return '季度报告'
    case 'year': return '年度报告'
    default: return '报告'
  }
})

const reportTitle = computed(() => {
  // 不再显示日期，只显示报告类型
  return `${reportTypeName.value}`
})

const reportContent = computed(() => {
  if (!reports.value[activeReport.value]) return ''
  return reports.value[activeReport.value]?.content || ''
})

// 修改formatTaskContent函数，使内容更加紧凑
const formatTaskContent = (content: string): string => {
  // 如果是本地生成的报告，进行特殊处理使其更加紧凑
  if (activeReport.value === 'local') {
    // 移除多余的空行
    let compactContent = content.replace(/\n{3,}/g, '\n\n');
    
    // 缩短任务描述，只保留前50个字符
    compactContent = compactContent.replace(/任务详情：([^\n]+)/g, (match, details) => {
      if (details.length > 50) {
        return `任务详情：${details.substring(0, 50)}...`;
      }
      return match;
    });
    
    // 移除"任务详情："前缀，使内容更紧凑
    compactContent = compactContent.replace(/任务详情：/g, '');
    
    // 移除"任务标题："前缀
    compactContent = compactContent.replace(/任务标题：/g, '');
    
    // 移除"任务优先级："前缀
    compactContent = compactContent.replace(/任务优先级：/g, '优先级: ');
    
    // 移除"任务完成状态："前缀
    compactContent = compactContent.replace(/任务完成状态：/g, '');
    
    // 移除"任务完成时间："前缀
    compactContent = compactContent.replace(/任务完成时间：/g, '完成于: ');
    
    // 移除"任务创建时间："前缀
    compactContent = compactContent.replace(/任务创建时间：/g, '创建于: ');
    
    // 移除"任务ID："前缀
    compactContent = compactContent.replace(/任务ID：/g, '');
    
    // 移除"任务日期："前缀
    compactContent = compactContent.replace(/任务日期：/g, '');
    
    // 移除"任务列表："前缀
    compactContent = compactContent.replace(/任务列表：/g, '');
    
    // 移除"任务统计："前缀
    compactContent = compactContent.replace(/任务统计：/g, '');
    
    // 移除"任务完成率："前缀
    compactContent = compactContent.replace(/任务完成率：/g, '完成率: ');
    
    // 移除"任务总数："前缀
    compactContent = compactContent.replace(/任务总数：/g, '总数: ');
    
    // 移除"已完成任务数："前缀
    compactContent = compactContent.replace(/已完成任务数：/g, '已完成: ');
    
    // 移除"未完成任务数："前缀
    compactContent = compactContent.replace(/未完成任务数：/g, '未完成: ');
    
    // 移除"高优先级任务数："前缀
    compactContent = compactContent.replace(/高优先级任务数：/g, '高优先级: ');
    
    // 移除"中优先级任务数："前缀
    compactContent = compactContent.replace(/中优先级任务数：/g, '中优先级: ');
    
    // 移除"低优先级任务数："前缀
    compactContent = compactContent.replace(/低优先级任务数：/g, '低优先级: ');
    
    // 移除"任务详情："前缀
    compactContent = compactContent.replace(/任务详情：/g, '');
    
    // 移除"任务详情："前缀
    compactContent = compactContent.replace(/任务详情：/g, '');
    
    // 移除"任务详情："前缀
    compactContent = compactContent.replace(/任务详情：/g, '');
    
    // 移除"td>"前缀
    compactContent = compactContent.replace(/td>/g, '');
    
    // 移除"<td>"前缀
    compactContent = compactContent.replace(/<td>/g, '');
    
    // 移除"</td>"前缀
    compactContent = compactContent.replace(/<\/td>/g, '');
    
    // 移除"<tr>"前缀
    compactContent = compactContent.replace(/<tr>/g, '');
    
    // 移除"</tr>"前缀
    compactContent = compactContent.replace(/<\/tr>/g, '');
    
    // 移除"<table>"前缀
    compactContent = compactContent.replace(/<table>/g, '');
    
    // 移除"</table>"前缀
    compactContent = compactContent.replace(/<\/table>/g, '');
    
    return compactContent;
  }
  
  return content;
}

// 添加任务详情展开/收起的初始化函数
const initTaskToggle = () => {
  nextTick(() => {
    // 为所有toggle按钮添加点击事件
  })
}

// 修改formattedContent计算属性，应用紧凑格式
const formattedContent = computed(() => {
  if (!reports.value[activeReport.value]) return ''
  
  const content = reports.value[activeReport.value]?.content || '';
  const formattedText = md.render(formatTaskContent(content));
  
  console.log('格式化后的内容长度:', formattedText.length);
  console.log('格式化后的内容前100个字符:', formattedText.substring(0, 100));
  
  nextTick(() => {
    initTaskToggle();
  });
  
  return formattedText;
})

const currentReportTime = computed(() => {
  if (!reports.value[activeReport.value]) return ''
  const timestamp = reports.value[activeReport.value]?.createdAt
  return timestamp ? new Date(timestamp).toLocaleString() : ''
})

// 日期格式化方法
const formatDateByType = (date: string, type: string) => {
  const d = dayjs(date)
  switch (type) {
    case 'day': return d.format('YYYY年MM月DD日')
    case 'week': return `${d.format('YYYY年MM月')}第${Math.ceil(d.date() / 7)}周`
    case 'month': return d.format('YYYY年MM月')
    case 'quarter': return `${d.format('YYYY年')}Q${Math.ceil((d.month() + 1) / 3)}`
    case 'year': return d.format('YYYY年')
    default: return d.format('YYYY-MM-DD')
  }
}

// 根据总结类型获取开始日期和结束日期
const getDateRange = () => {
  const d = dayjs(props.date)
  let startDate, endDate
  
  switch (props.summaryType) {
    case 'day':
      startDate = d.startOf('day')
      endDate = d.endOf('day')
      break
    case 'week':
      startDate = d.startOf('week')
      endDate = d.endOf('week')
      break
    case 'month':
      startDate = d.startOf('month')
      endDate = d.endOf('month')
      break
    case 'quarter':
      const quarterStartMonth = Math.floor(d.month() / 3) * 3
      startDate = d.month(quarterStartMonth).startOf('month')
      endDate = d.month(quarterStartMonth + 2).endOf('month')
      break
    case 'year':
      startDate = d.startOf('year')
      endDate = d.endOf('year')
      break
    default:
      startDate = d.startOf('day')
      endDate = d.endOf('day')
  }
  
  return { 
    startDate: startDate.subtract(1, 'second'), 
    endDate: endDate.add(1, 'second')
  }
}

// 获取该时间段的任务数据
const getTasksByTimeRange = async (): Promise<Task[]> => {
  try {
    const allTasks = await (window as any).electronAPI?.store?.get('tasks') || []
    if (!Array.isArray(allTasks) || allTasks.length === 0) return []

    const { startDate, endDate } = getDateRange()
    
    const filteredTasks = allTasks.filter((task: Task) => {
      const taskDate = dayjs(task.date)
      
      if (props.summaryType === 'day') {
        return taskDate.format('YYYY-MM-DD') === dayjs(props.date).format('YYYY-MM-DD')
      }
      
      return taskDate.isAfter(startDate) && taskDate.isBefore(endDate)
    })
    
    return filteredTasks
  } catch (error) {
    console.error('获取任务失败:', error)
    return []
  }
}

// 添加获取目标数据的函数
const getGoalsByDate = async (date: string): Promise<any[]> => {
  try {
    // 从本地存储中获取目标数据
    const allGoals = await (window as any).electronAPI?.store?.get('goals') || []
    if (!Array.isArray(allGoals) || allGoals.length === 0) return []
    
    // 过滤出指定日期的目标
    const targetDate = dayjs(date).format('YYYY-MM-DD')
    const filteredGoals = allGoals.filter((goal: any) => {
      const goalDate = dayjs(goal.date).format('YYYY-MM-DD')
      return goalDate === targetDate
    })
    
    return filteredGoals
  } catch (error) {
    console.error('获取目标数据失败:', error)
    return []
  }
}

// 生成报告
const generateReport = async (): Promise<void> => {
  if (isGenerating.value) return
  
  // 如果选择非本地生成，需要检查API密钥
  if (selectedProvider.value !== 'local') {
    // 使用缓存的API密钥状态
    if (!apiKeyStatus.value[selectedProvider.value]) {
      ElMessage.warning(`请先在设置中配置${selectedProvider.value === 'deepseek' ? 'DeepSeek' : 'OpenAI'} API密钥`)
      return
    }
  }
  
  isGenerating.value = true
  
  try {
    let result = '';
    
    // 根据选择的提供商生成总结
    if (selectedProvider.value === 'local') {
      // 本地生成总结 - 获取任务和目标数据
      const tasks = await getTasksByTimeRange()
      const goals = await getGoalsByDate(props.date)
      
      if (tasks.length === 0 && goals.length === 0) {
        ElMessage.warning('该时间段内没有任务和目标记录')
        isGenerating.value = false
        return
      }
      
      // 使用任务和目标数据生成本地总结
      // @ts-ignore - 忽略类型检查，因为generateLocalSummary可能需要两个参数
      result = generateLocalSummary(tasks, goals)
    } else {
      // 调用AI接口生成总结
      try {
        // 获取任务数据
        const tasks = await getTasksByTimeRange()
        if (tasks.length === 0) {
          ElMessage.warning('该时间段内没有任务记录')
          isGenerating.value = false
          return
        }
        
        const prompt = `请根据以下任务列表生成一份${reportTypeName.value}：\n\n${JSON.stringify(tasks, null, 2)}`
        result = await (window as any).electronAPI?.ai?.generateSummary(selectedProvider.value, prompt) || '生成失败'
      } catch (error) {
        console.error('调用AI接口失败:', error)
        throw new Error('调用AI接口失败，请检查网络连接和API配置')
      }
    }
    
    // 保存报告并更新状态
    await saveReport(selectedProvider.value, result)
    
    // 切换到刚生成的报告
    activeReport.value = selectedProvider.value
    
    ElMessage.success('报告生成成功')
  } catch (error: any) {
    console.error('生成报告失败:', error)
    ElMessage.error(`生成报告失败: ${error?.message || '未知错误'}`)
  } finally {
    isGenerating.value = false
  }
}

// 保存报告
const saveReport = async (provider: 'local' | 'deepseek' | 'openai', content: string): Promise<void> => {
  try {
    // 获取已保存的总结
    const summaries: Summary[] = await (window as any).electronAPI?.store?.get('summaries') || []
    
    // 检查是否已存在相同日期、类型和提供商的总结
    const existingIndex = summaries.findIndex(s => 
      s.date === props.date && 
      s.type === props.summaryType && 
      s.provider === provider
    )
    
    const reportId = existingIndex >= 0 
      ? summaries[existingIndex].id 
      : `${props.summaryType}-${props.date}-${provider}-${Date.now()}`
    
    // 创建新的总结记录
    const newSummary: Summary = {
      id: reportId,
      date: props.date,
      type: props.summaryType,
      title: reportTitle.value,
      content: content,
      provider: provider,
      createdAt: Date.now()
    }
    
    // 如果已存在，则替换；否则添加
    if (existingIndex >= 0) {
      summaries[existingIndex] = newSummary
    } else {
      summaries.push(newSummary)
    }
    
    // 保存总结
    await (window as any).electronAPI?.store?.set('summaries', summaries)
    
    // 更新本地报告缓存
    reports.value[provider] = {
      content: content,
      id: reportId,
      createdAt: Date.now()
    }
  } catch (error) {
    console.error('保存报告失败:', error)
    throw error
  }
}

// 加载已保存的报告
const loadSavedReports = async (): Promise<void> => {
  try {
    // 获取已保存的总结
    const summaries: Summary[] = await (window as any).electronAPI?.store?.get('summaries') || []
    
    // 查找当前日期和类型的所有总结
    const matchingSummaries = summaries.filter(s => 
      s.date === props.date && s.type === props.summaryType
    )
    
    // 重置报告缓存
    reports.value = {
      local: null,
      deepseek: null,
      openai: null
    }
    
    if (matchingSummaries.length > 0) {
      // 按provider分类并获取每种类型的最新报告
      const localSummaries = matchingSummaries
        .filter(s => s.provider === 'local')
        .sort((a, b) => b.createdAt - a.createdAt)
      
      const deepseekSummaries = matchingSummaries
        .filter(s => s.provider === 'deepseek')
        .sort((a, b) => b.createdAt - a.createdAt)
      
      const openaiSummaries = matchingSummaries
        .filter(s => s.provider === 'openai')
        .sort((a, b) => b.createdAt - a.createdAt)
      
      // 存储各提供商的最新报告
      if (localSummaries.length > 0) {
        reports.value.local = {
          content: localSummaries[0].content,
          id: localSummaries[0].id,
          createdAt: localSummaries[0].createdAt
        }
      }
      
      if (deepseekSummaries.length > 0) {
        reports.value.deepseek = {
          content: deepseekSummaries[0].content,
          id: deepseekSummaries[0].id,
          createdAt: deepseekSummaries[0].createdAt
        }
      }
      
      if (openaiSummaries.length > 0) {
        reports.value.openai = {
          content: openaiSummaries[0].content,
          id: openaiSummaries[0].id,
          createdAt: openaiSummaries[0].createdAt
        }
      }
      
      // 确定默认显示的报告
      activeReport.value = getDefaultActiveReport()
    }
  } catch (error) {
    console.error('加载报告失败:', error)
  }
}

// 重新生成当前查看的报告
const regenerateCurrentReport = () => {
  selectedProvider.value = activeReport.value
  generateReport()
}

// 复制报告内容
const copyReport = () => {
  if (!reportContent.value) {
    ElMessage.warning('没有内容可复制')
    return
  }
  
  navigator.clipboard.writeText(reportContent.value)
    .then(() => ElMessage.success('已复制到剪贴板'))
    .catch(() => ElMessage.error('复制失败'))
}

// 监听日期和类型变化
watch([() => props.date, () => props.summaryType], async () => {
  await loadSavedReports()
}, { immediate: true })

// 组件挂载时加载报告
onMounted(async () => {
  await loadSavedReports()
  await initAPIKeyStatus()
})

// 确定默认显示的报告
const getDefaultActiveReport = (): 'local' | 'deepseek' | 'openai' => {
  if (reports.value.local) {
    return 'local'
  } else if (reports.value.deepseek) {
    return 'deepseek'
  } else if (reports.value.openai) {
    return 'openai'
  }
  return 'local'
}

activeReport.value = getDefaultActiveReport()

// 提取任务统计
const extractTaskStats = (content: string): string => {
  console.log('提取任务统计，内容长度:', content.length);
  
  // 尝试匹配包含任务统计的表格内容
  const statsTableMatch = content.match(/<table[^>]*>[\s\S]*?(?:总任务数|总数|完成率|已完成|未完成)[\s\S]*?<\/table>/);
  if (statsTableMatch) {
    console.log('匹配到任务统计表格');
    return `<table class="stats-table">${statsTableMatch[0]}</table>`;
  }
  
  // 尝试匹配更多可能的标题格式
  const possibleTitles = [
    '<h2>任务统计</h2>',
    '<h2>任务完成情况</h2>',
    '<h2>任务概述</h2>',
    '<h2>任务总结</h2>',
    '<h2>任务完成率</h2>',
    '<h2>任务完成统计</h2>'
  ];
  
  for (const title of possibleTitles) {
    const titleIndex = content.indexOf(title);
    if (titleIndex !== -1) {
      console.log('匹配到标题:', title);
      // 找到标题后的内容，直到下一个标题或结束
      let endIndex = content.indexOf('<h2>', titleIndex + title.length);
      if (endIndex === -1) endIndex = content.length;
      
      const sectionContent = content.substring(titleIndex + title.length, endIndex).trim();
      if (sectionContent) {
        return sectionContent;
      }
    }
  }
  
  // 尝试查找包含关键词的部分
  const keywords = ['任务总数', '完成率', '已完成任务数', '未完成任务数'];
  for (const keyword of keywords) {
    // 查找包含关键词的段落
    const paragraphRegex = new RegExp(`<p[^>]*>[^<]*${keyword}[^<]*<\/p>`, 'i');
    const paragraphMatch = content.match(paragraphRegex);
    if (paragraphMatch) {
      console.log('匹配到关键词段落:', keyword);
      return paragraphMatch[0];
    }
  }
  
  // 如果以上都没有匹配到，返回"无任务统计数据"
  console.log('未匹配到任何任务统计内容');
  return '<p>无任务统计数据</p>';
};

// 提取未完成目标
const extractUncompletedTasks = (content: string): string => {
  console.log('提取未完成目标，内容长度:', content.length);
  
  // 可能的标题格式
  const possibleTitles = [
    '<h2>未完成事项</h2>',
    '<h2>未完成任务</h2>',
    '<h2>待办事项</h2>',
    '<h2>待办目标</h2>',
    '<h2>未完成目标</h2>',
    '<h2>待办</h2>',
    '<h2>未完成</h2>',
    '<h2>二、未完成事项</h2>'
  ];
  
  // 尝试匹配包含未完成任务的表格或列表
  const uncompletedListMatch = content.match(/<(ul|ol|table)[^>]*>[\s\S]*?(?:未完成|待办|未达成)[\s\S]*?<\/(ul|ol|table)>/);
  if (uncompletedListMatch) {
    console.log('匹配到未完成任务列表或表格');
    return uncompletedListMatch[0];
  }
  
  // 尝试匹配标题后的内容
  for (const title of possibleTitles) {
    const titleIndex = content.indexOf(title);
    if (titleIndex !== -1) {
      console.log('匹配到未完成标题:', title);
      // 找到标题后的内容，直到下一个标题或结束
      let endIndex = content.indexOf('<h2>', titleIndex + title.length);
      if (endIndex === -1) endIndex = content.length;
      
      const sectionContent = content.substring(titleIndex + title.length, endIndex).trim();
      if (sectionContent) {
        return sectionContent;
      }
    }
  }
  
  // 尝试匹配关键词后的段落内容
  const keywords = ['未完成', '待办', '未达成', '待处理'];
  for (const keyword of keywords) {
    // 使用段落匹配
    const paragraphRegex = new RegExp(`<p[^>]*>[^<]*${keyword}[^<]*<\/p>`, 'g');
    const matches = Array.from(content.matchAll(paragraphRegex));
    if (matches.length > 0) {
      console.log('匹配到未完成关键词段落:', keyword);
      return matches.map(m => m[0]).join('\n');
    }
  }
  
  // 使用关键词匹配任何节点
  const keywordRegex = /<[^>]*>([^<]*(?:未完成|待办|未达成)[^<]*)<\/[^>]*>/g;
  const keywordMatches = Array.from(content.matchAll(keywordRegex));
  if (keywordMatches.length > 0) {
    console.log('匹配到未完成关键词节点');
    return keywordMatches.map(m => `<p>${m[1]}</p>`).join('\n');
  }
  
  // 如果以上都没有匹配到，返回"无未完成目标"
  console.log('未匹配到任何未完成目标内容');
  return '<p>无未完成目标</p>';
};

// 提取已完成目标
const extractCompletedTasks = (content: string): string => {
  console.log('提取已完成目标，内容长度:', content.length);
  
  // 可能的标题格式
  const possibleTitles = [
    '<h2>已完成事项</h2>',
    '<h2>已完成任务</h2>',
    '<h2>完成的目标</h2>',
    '<h2>已完成目标</h2>',
    '<h2>已完成</h2>',
    '<h2>完成</h2>',
    '<h2>一、今日完成事项</h2>'
  ];
  
  // 尝试匹配包含已完成任务的表格或列表
  const completedListMatch = content.match(/<(ul|ol|table)[^>]*>[\s\S]*?(?:已完成|完成的|达成)[\s\S]*?<\/(ul|ol|table)>/);
  if (completedListMatch) {
    console.log('匹配到已完成任务列表或表格');
    return completedListMatch[0];
  }
  
  // 尝试匹配标题后的内容
  for (const title of possibleTitles) {
    const titleIndex = content.indexOf(title);
    if (titleIndex !== -1) {
      console.log('匹配到已完成标题:', title);
      // 找到标题后的内容，直到下一个标题或结束
      let endIndex = content.indexOf('<h2>', titleIndex + title.length);
      if (endIndex === -1) endIndex = content.length;
      
      const sectionContent = content.substring(titleIndex + title.length, endIndex).trim();
      if (sectionContent) {
        return sectionContent;
      }
    }
  }
  
  // 尝试匹配关键词后的段落内容
  const keywords = ['已完成', '完成', '达成', '完成的目标'];
  for (const keyword of keywords) {
    // 使用段落匹配
    const paragraphRegex = new RegExp(`<p[^>]*>[^<]*${keyword}[^<]*<\/p>`, 'g');
    const matches = Array.from(content.matchAll(paragraphRegex));
    if (matches.length > 0) {
      console.log('匹配到已完成关键词段落:', keyword);
      return matches.map(m => m[0]).join('\n');
    }
  }
  
  // 使用关键词匹配任何节点
  const keywordRegex = /<[^>]*>([^<]*(?:已完成|完成的|达成)[^<]*)<\/[^>]*>/g;
  const keywordMatches = Array.from(content.matchAll(keywordRegex));
  if (keywordMatches.length > 0) {
    console.log('匹配到已完成关键词节点');
    return keywordMatches.map(m => `<p>${m[1]}</p>`).join('\n');
  }
  
  // 如果以上都没有匹配到，返回"无已完成目标"
  console.log('未匹配到任何已完成目标内容');
  return '<p>无已完成目标</p>';
};

// 添加提取优先级统计的函数
const extractPriorityStats = (content: string): string => {
  console.log('提取优先级统计，内容长度:', content.length);
  
  // 尝试匹配表格内容
  const tableMatch = content.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (tableMatch && tableMatch[1]) {
    console.log('匹配到表格内容');
    return `<table class="stats-table">${tableMatch[1]}</table>`;
  }
  
  // 尝试匹配更多可能的标题格式
  const possibleTitles = [
    '<h2>优先级分布</h2>',
    '<h2>任务优先级分布</h2>',
    '<h2>优先级统计</h2>',
    '<h2>任务优先级</h2>'
  ];
  
  for (const title of possibleTitles) {
    const regex = new RegExp(`${title}([\\s\\S]*?)(?=<h2>|$)`);
    const match = content.match(regex);
    if (match && match[1]) {
      console.log('匹配到标题:', title);
      return match[1];
    }
  }
  
  // 如果仍然没有匹配到，尝试查找包含关键词的部分
  const keywords = ['高优先级', '中优先级', '低优先级', '优先级'];
  for (const keyword of keywords) {
    const regex = new RegExp(`([^<]*${keyword}[^<]*)`);
    const match = content.match(regex);
    if (match) {
      console.log('匹配到关键词:', keyword);
      return `<p>${match[1]}</p>`;
    }
  }
  
  // 如果以上都没有匹配到，返回整个内容的前200个字符
  console.log('未匹配到任何内容，返回前200个字符');
  return content.substring(0, 200);
}

// 添加提取任务列表的函数
const extractTaskList = (content: string): string => {
  console.log('提取任务列表，内容长度:', content.length);
  
  // 尝试匹配更多可能的标题格式
  const possibleTitles = [
    '<h2>任务列表</h2>',
    '<h2>已完成任务</h2>',
    '<h2>未完成任务</h2>',
    '<h2>任务详情</h2>',
    '<h2>任务内容</h2>',
    '<h2>任务概述</h2>',
    '<h2>任务总结</h2>',
    '<h2>一、今日完成事项</h2>',
    '<h2>二、未完成事项</h2>'
  ];
  
  // 首先尝试找到任务列表部分
  for (const title of possibleTitles) {
    const regex = new RegExp(`${title}([\\s\\S]*?)(?=<h2>|$)`);
    const match = content.match(regex);
    if (match && match[1]) {
      console.log('匹配到标题:', title);
      // 如果找到的是统计表格，继续查找下一个标题
      if (match[1].includes('总任务数') || match[1].includes('完成率')) {
        continue;
      }
      return match[1];
    }
  }
  
  // 如果没有找到明确的任务列表，尝试查找包含任务内容的部分
  const taskContentRegex = /<h2>.*?任务.*?<\/h2>([\s\S]*?)(?=<h2>|$)/g;
  let match;
  while ((match = taskContentRegex.exec(content)) !== null) {
    const section = match[1];
    // 跳过统计表格
    if (!section.includes('总任务数') && !section.includes('完成率')) {
      return section;
    }
  }
  
  // 如果以上都没有找到，尝试查找包含任务内容的任何部分
  const taskRegex = /<h2>.*?<\/h2>([\s\S]*?)(?=<h2>|$)/g;
  let taskMatch;
  while ((taskMatch = taskRegex.exec(content)) !== null) {
    const section = taskMatch[1];
    // 跳过统计表格
    if (!section.includes('总任务数') && !section.includes('完成率')) {
      return section;
    }
  }
  
  // 如果以上都没有找到，尝试直接查找任务内容
  const taskContentMatch = content.match(/<h2>.*?<\/h2>([\s\S]*?)(?=<h2>|$)/);
  if (taskContentMatch && taskContentMatch[1]) {
    return taskContentMatch[1];
  }
  
  // 如果以上都没有找到，尝试查找包含"一、今日完成事项"或"二、未完成事项"的部分
  const sectionRegex = /(一、今日完成事项|二、未完成事项)([\s\S]*?)(?=一、|二、|$)/g;
  let sectionMatch;
  let result = '';
  while ((sectionMatch = sectionRegex.exec(content)) !== null) {
    result += sectionMatch[0] + '\n\n';
  }
  if (result) {
    return result;
  }
  
  // 如果以上都没有找到，返回整个内容
  console.log('未匹配到任何内容，返回整个内容');
  return content;
}

// 添加API密钥状态跟踪
const apiKeyStatus = ref<Record<string, boolean>>({
  deepseek: false,
  openai: false
})

// 初始化API密钥状态
const initAPIKeyStatus = async () => {
  apiKeyStatus.value.deepseek = await checkAPIKey('deepseek')
  apiKeyStatus.value.openai = await checkAPIKey('openai')
}

// 打开设置窗口（通过事件通知父组件）
const openSettings = (provider: 'deepseek' | 'openai'): void => {
  emit('open-settings', provider)
}

// 添加hasAPIKey计算属性
const hasAPIKey = async (provider: 'local' | 'deepseek' | 'openai'): Promise<boolean> => {
  if (provider === 'local') return true
  return await checkAPIKey(provider)
}

// 检查API密钥是否已配置
const checkAPIKey = async (provider: 'deepseek' | 'openai'): Promise<boolean> => {
  if (!(window as any).electronAPI?.apiKeys) {
    ElMessage.error('API功能不可用')
    return false
  }

  try {
    const apiKey = await (window as any).electronAPI.apiKeys.get(provider)
    return !!apiKey // 返回true如果有密钥，否则返回false
  } catch (error) {
    console.error('检查API密钥失败:', error)
    ElMessage.error('检查API密钥失败')
    return false
  }
}

// 删除API密钥
const deleteApiKey = async (provider: 'deepseek' | 'openai'): Promise<void> => {
  try {
    if (!(window as any).electronAPI?.apiKeys?.deleteApiKey) {
      ElMessage.error('删除API密钥功能不可用')
      return
    }
    
    await ElMessageBox.confirm(
      `确定要删除${provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'} API密钥吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const result = await (window as any).electronAPI.apiKeys.deleteApiKey(provider)
    if (result) {
      ElMessage.success('API密钥已删除')
      // 更新API密钥状态
      apiKeyStatus.value[provider] = false
    } else {
      ElMessage.error('删除API密钥失败')
    }
  } catch (error) {
    // 用户取消操作
    if (error !== 'cancel') {
      console.error('删除API密钥失败:', error)
      ElMessage.error('删除API密钥失败')
    }
  }
}

// 修改switchReport函数
const switchReport = async (provider: 'local' | 'deepseek' | 'openai') => {
  try {
    // 检查非本地提供商
    if (provider !== 'local') {
      // 使用缓存的API密钥状态
      if (!apiKeyStatus.value[provider]) {
        await ElMessageBox.confirm(
          `使用${provider === 'deepseek' ? 'DeepSeek' : 'OpenAI'}需要配置API密钥`,
          '密钥未配置', 
          {
            confirmButtonText: '前往配置',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        // 只有用户确认后才跳转设置
        emit('open-settings', provider)
        return
      }
    }
    
    // 切换到选择的提供商
    if (reports.value[provider]) {
      activeReport.value = provider
    } else {
      ElMessage.info('该提供商暂无历史报告')
    }
  } catch (error) {
    // 用户点击取消时不进行任何操作
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="AI报告生成与查看"
    width="80%"
    :close-on-click-modal="false"
    :close-on-press-escape="!isGenerating"
    top="5vh"
    append-to-body
    destroy-on-close
  >
    <!-- 报告内容区域 -->
    <div class="report-dialog-content">
      <!-- 生成报告选项 -->
      <div v-if="!reports[activeReport]" class="report-options">
        <h3 class="section-title">选择报告生成方式</h3>
        
        <div class="provider-selector">
          <el-radio-group v-model="selectedProvider" size="large">
            <el-radio-button value="local">本地生成</el-radio-button>
            <el-radio-button value="deepseek">
              DeepSeek
              <el-tooltip
                content="需要配置DeepSeek API密钥"
                placement="top"
                effect="light"
              >
                <span class="api-notice">API</span>
              </el-tooltip>
            </el-radio-button>
            <el-radio-button value="openai">
              OpenAI
              <el-tooltip
                content="需要配置OpenAI API密钥"
                placement="top"
                effect="light"
              >
                <span class="api-notice">API</span>
              </el-tooltip>
            </el-radio-button>
          </el-radio-group>
        </div>
        
        <el-alert
          type="info"
          show-icon
          :closable="false"
          class="provider-info"
        >
          <strong>{{ selectedProvider === 'local' ? '本地生成' : selectedProvider === 'deepseek' ? 'DeepSeek生成' : 'OpenAI生成' }}</strong>：
          {{ selectedProvider === 'local' 
            ? '不消耗API调用额度，生成简单统计报告，适合快速查看任务完成情况' 
            : selectedProvider === 'deepseek' 
              ? '使用DeepSeek AI生成详细分析报告，消耗API调用额度，适合需要深入分析的场景' 
              : '使用OpenAI生成详细分析报告，消耗API调用额度，适合需要全面总结的场景' 
          }}
        </el-alert>
        
        <div class="action-buttons">
          <el-button 
            type="primary" 
            size="large"
            :loading="isGenerating" 
            @click="generateReport"
          >
            {{ isGenerating ? '正在生成...' : `生成${reportTypeName}` }}
          </el-button>
        </div>
      </div>
      
      <!-- 报告内容展示 -->
      <div v-if="reports[activeReport]" class="report-container">
        <!-- 报告头部信息 -->
        <div class="summary-header">
          <h2 class="report-title">{{ reportTitle }}</h2>
          <div class="generation-info">
            <span>由</span>
            <span class="provider-name">{{ providerNames[activeReport] }}</span>
            <span>生成于 {{ currentReportTime }}</span>
          </div>
        </div>

        <div class="report-actions">
          <el-button-group>
            <el-button 
              v-for="provider in ['local', 'deepseek', 'openai']" 
              :key="provider"
              :type="activeReport === provider ? 'primary' : 'default'"
              :class="{ 
                'provider-button': true, 
                'has-report': !!reports[provider as ReportType] 
              }"
              @click="switchReport(provider as ReportType)"
              :disabled="!reports[provider as ReportType] && isGenerating"
            >
              {{ providerNames[provider as ReportType] }}
              <el-tag
                v-if="provider !== 'local' && !apiKeyStatus[provider]"
                size="small"
                type="danger"
                effect="plain"
                style="margin-left: 8px; vertical-align: text-top;"
              >
                未配置
              </el-tag>
              <el-badge v-if="!!reports[provider as ReportType]" :is-dot="true" class="report-badge" />
            </el-button>
          </el-button-group>
          
          <div class="action-buttons">
            <el-button 
              v-if="activeReport !== 'local' && apiKeyStatus[activeReport] && summaryType !== 'day'"
              type="danger" 
              plain
              size="small"
              icon="Delete"
              @click="deleteApiKey(activeReport)"
            >
              删除密钥
            </el-button>
            
            <el-button 
              type="primary" 
              plain
              icon="Refresh"
              @click="regenerateCurrentReport"
              :loading="isGenerating"
            >
              重新生成
            </el-button>
            
            <el-button 
              type="success" 
              plain
              icon="Document"
              @click="copyReport"
            >
              复制内容
            </el-button>
          </div>
        </div>
        
        <!-- 报告内容 -->
        <div class="report-content">
          <div v-if="!reports[activeReport] && !isGenerating" class="no-report">
            <el-empty description="暂无此类型报告">
              <el-button type="primary" @click="selectedProvider = activeReport; generateReport()">
                生成{{ providerNames[activeReport] }}报告
              </el-button>
            </el-empty>
          </div>
          
          <div v-else-if="isGenerating" class="generating">
            <el-skeleton :rows="8" animated />
            <div class="generating-text">正在生成报告，请稍候...</div>
          </div>
          
          <!-- 所有报告使用相同的内容显示方式 -->
          <div v-else class="ai-report-content">
            <div class="markdown-content" v-html="formattedContent"></div>
          </div>
        </div>
      </div>
    </div>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="visible = false" :disabled="isGenerating">关闭</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<style scoped>
.report-dialog-content {
  min-height: 300px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 0;
  background-color: #ffffff;
  border-radius: 4px;
}

.summary-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  gap: 10px;
}

.report-title {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.generation-info {
  font-size: 12px;
  color: #606266;
}

.provider-name {
  font-weight: bold;
  margin: 0 4px;
}

/* 生成选项样式 */
.report-options {
  padding: 15px;
  background-color: #f7f9fc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  text-align: center;
}

.section-title {
  color: #303133;
  font-size: 16px;
  margin: 0 0 8px 0;
}

.provider-selector {
  margin: 8px 0;
}

.provider-info {
  width: 100%;
  max-width: 600px;
  margin: 8px auto;
}

.api-notice {
  display: inline-block;
  background-color: #e6a23c;
  color: white;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: 4px;
  vertical-align: super;
  font-weight: bold;
}

.action-buttons {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

/* 报告容器样式 */
.report-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.report-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 15px;
  background-color: #ffffff;
  border-bottom: 1px solid #ebeef5;
  flex-wrap: wrap;
  gap: 8px;
}

.provider-button {
  position: relative;
}

.has-report {
  font-weight: 500;
}

.report-badge {
  margin-left: 4px;
}

.report-content {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
}

.no-report, .generating {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 150px;
}

.generating-text {
  margin-top: 15px;
  color: #909399;
  font-style: italic;
}

/* Markdown内容样式 */
.markdown-content {
  font-size: 13px;
  line-height: 1.3;
}

/* 本地报告特殊样式 */
.markdown-content :deep(h1) {
  font-size: 1.4em;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

.markdown-content :deep(h2) {
  font-size: 1.2em;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

.markdown-content :deep(h3) {
  font-size: 1.1em;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

.markdown-content :deep(p) {
  margin-top: 0.2em;
  margin-bottom: 0.2em;
}

.markdown-content :deep(ul), 
.markdown-content :deep(ol) {
  margin-top: 0.2em;
  margin-bottom: 0.2em;
  padding-left: 1.2em;
}

.markdown-content :deep(li) {
  margin-bottom: 0.1em;
}

.task-list {
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 6px;
  background-color: var(--el-fill-color-light);
}

.task-items {
  list-style-type: none;
  padding: 0;
  margin: 0;
}

.task-item {
  margin-bottom: 6px;
  padding: 6px;
  border-radius: 4px;
  background-color: var(--el-bg-color);
  border-left: 3px solid var(--el-color-primary);
}

.task-title {
  font-weight: bold;
  margin-bottom: 2px;
}

.task-summary {
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
  margin-bottom: 2px;
}

.toggle-details {
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 0.8rem;
  margin-left: 5px;
}

.task-details {
  margin-top: 4px;
  padding: 6px;
  background-color: var(--el-fill-color);
  border-radius: 4px;
  font-size: 0.85rem;
  white-space: pre-line;
}

@media (max-width: 768px) {
  .task-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .toggle-details {
    margin-top: 4px;
  }
}

/* 卡片式布局样式 */
.card-layout {
  display: flex;
  gap: 15px;
  height: 100%;
}

.card-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.info-card {
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.info-card h3 {
  margin: 0;
  padding: 10px 15px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  font-size: 16px;
  color: #303133;
}

.card-content {
  padding: 15px;
  flex: 1;
  overflow-y: auto;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .card-layout {
    flex-direction: column;
  }
  
  .card-column {
    width: 100%;
  }
}

/* 表格样式 */
.card-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px;
}

.card-content :deep(th),
.card-content :deep(td) {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.card-content :deep(th) {
  background-color: #f5f7fa;
  font-weight: bold;
}

.card-content :deep(tr:hover) {
  background-color: #f5f7fa;
}

.card-content :deep(td) {
  vertical-align: top;
}

.card-content :deep(td:first-child) {
  width: 30%;
  font-weight: 500;
}

.card-content :deep(td:last-child) {
  width: 70%;
}

/* AI报告内容样式 */
.ai-report-content {
  padding: 15px;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.ai-report-content :deep(h1) {
  font-size: 1.6em;
  margin-top: 0.6em;
  margin-bottom: 0.6em;
  color: #303133;
}

.ai-report-content :deep(h2) {
  font-size: 1.4em;
  margin-top: 0.6em;
  margin-bottom: 0.6em;
  color: #303133;
}

.ai-report-content :deep(h3) {
  font-size: 1.2em;
  margin-top: 0.6em;
  margin-bottom: 0.6em;
  color: #303133;
}

.ai-report-content :deep(p) {
  margin-top: 0.4em;
  margin-bottom: 0.4em;
  line-height: 1.6;
}

.ai-report-content :deep(ul), 
.ai-report-content :deep(ol) {
  margin-top: 0.4em;
  margin-bottom: 0.4em;
  padding-left: 1.5em;
}

.ai-report-content :deep(li) {
  margin-bottom: 0.3em;
  line-height: 1.6;
}

.ai-report-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}

.ai-report-content :deep(th),
.ai-report-content :deep(td) {
  padding: 10px;
  text-align: left;
  border: 1px solid #ebeef5;
}

.ai-report-content :deep(th) {
  background-color: #f5f7fa;
  font-weight: bold;
}

.ai-report-content :deep(tr:hover) {
  background-color: #f5f7fa;
}

/* 本地报告特殊样式 */
.card-content :deep(h1) {
  font-size: 1.4em;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

.card-content :deep(h2) {
  font-size: 1.2em;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

.card-content :deep(h3) {
  font-size: 1.1em;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

.card-content :deep(p) {
  margin-top: 0.2em;
  margin-bottom: 0.2em;
}

.card-content :deep(ul), 
.card-content :deep(ol) {
  margin-top: 0.2em;
  margin-bottom: 0.2em;
  padding-left: 1.2em;
}

.card-content :deep(li) {
  margin-bottom: 0.1em;
}
</style>

