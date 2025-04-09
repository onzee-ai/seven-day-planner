import dayjs from 'dayjs';

// 任务类型定义
interface Task {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  date: string;
  priority?: 'low' | 'medium' | 'high';
  result?: string;  // 添加结果字段
}

/**
 * 生成本地任务总结
 * @param tasks 任务列表
 * @returns 格式化的Markdown总结文本
 */
export function generateLocalSummary(tasks: Task[]): string {
  // 计算统计数据
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed);
  const pendingTasks = tasks.filter(t => !t.completed);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;
  
  // 按照日期分组任务
  const tasksByDate = tasks.reduce((acc: {[key: string]: Task[]}, task: Task) => {
    if (!acc[task.date]) {
      acc[task.date] = [];
    }
    acc[task.date].push(task);
    return acc;
  }, {});
  
  // 生成总结内容
  let content = `# 工作总结\n\n`;
  
  // 关键指标展示
  content += `## 📊 完成情况概览\n\n`;
  content += `| 指标 | 数值 |\n`;
  content += `| ---- | ---- |\n`;
  content += `| 总任务数 | ${totalTasks}项 |\n`;
  content += `| 已完成 | ${completedTasks.length}项 |\n`;
  content += `| 未完成 | ${pendingTasks.length}项 |\n`;
  content += `| 完成率 | ${completionRate}% |\n\n`;
  
  // 合并已完成和待办任务到一个表格
  content += `## 📋 任务列表\n\n`;
  if (totalTasks > 0) {
    // 创建表格头
    content += `| 目标 | 状态 | 详情 | 结果 |\n`;
    content += `| ---- | ---- | ---- | ---- |\n`;
    
    // 整合所有任务
    const allTasks = [...tasks].sort((a, b) => {
      // 按日期排序
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      // 已完成的任务排在后面
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      // 同状态按标题排序
      return a.title.localeCompare(b.title);
    });
    
    // 为每个任务添加一行
    allTasks.forEach(task => {
      const status = task.completed ? '✅ 已完成' : '⏳ 待办';
      
      // 处理详情内容，将换行符替换为HTML换行，确保在表格中正确显示
      let notesContent = '-';
      if (task.notes) {
        // 替换换行符为HTML <br> 标签
        notesContent = task.notes.replace(/\n/g, '<br>');
      }
      
      // 处理结果内容，同样替换换行符
      let resultContent = '-';
      if (task.result) {
        resultContent = task.result.replace(/\n/g, '<br>');
      }
      
      content += `| **${task.title}** | ${status} | ${notesContent} | ${resultContent} |\n`;
    });
    
    content += `\n`;
  } else {
    content += '当前时间段内没有任务。\n\n';
  }
  
  content += '_此报告由系统本地生成_';
  
  return content;
} 