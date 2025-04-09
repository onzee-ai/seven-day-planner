<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Key, Delete } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 状态
const deepseekKey = ref('')
const openaiKey = ref('')
const isLoadingDeepseek = ref(false)
const isLoadingOpenAI = ref(false)
const deepseekValidated = ref(false)
const openaiValidated = ref(false)

// 方法
const loadKeys = async () => {
  try {
    if (!window.electronAPI?.apiKeys) {
      console.warn('[SettingsPage] API Keys功能不可用')
      return
    }

    // 加载DeepSeek API密钥
    const dkey = await window.electronAPI.apiKeys.get('deepseek')
    if (dkey) {
      deepseekKey.value = dkey
      deepseekValidated.value = true
    }

    // 加载OpenAI API密钥
    const okey = await window.electronAPI.apiKeys.get('openai')
    if (okey) {
      openaiKey.value = okey
      openaiValidated.value = true
    }
  } catch (error: any) {
    console.error('[SettingsPage] Failed to load API keys:', error)
    ElMessage.error(`加载API密钥失败: ${error.message || '未知错误'}`)
  }
}

const saveDeepseekKey = async () => {
  if (!deepseekKey.value.trim()) {
    ElMessage.warning('请输入DeepSeek API密钥')
    return
  }

  try {
    isLoadingDeepseek.value = true

    if (!window.electronAPI?.apiKeys) {
      ElMessage.error('API Keys功能不可用')
      return
    }

    // 验证密钥
    const isValid = await window.electronAPI.apiKeys.validateDeepseek(deepseekKey.value)
    if (isValid) {
      // 保存密钥
      await window.electronAPI.apiKeys.set('deepseek', deepseekKey.value)
      deepseekValidated.value = true
      ElMessage.success('DeepSeek API密钥已保存并验证通过')
    } else {
      ElMessage.error('DeepSeek API密钥验证失败，请检查密钥是否正确')
      deepseekValidated.value = false
    }
  } catch (error: any) {
    console.error('[SettingsPage] Failed to save DeepSeek API key:', error)
    ElMessage.error(`保存DeepSeek API密钥失败: ${error.message || '未知错误'}`)
    deepseekValidated.value = false
  } finally {
    isLoadingDeepseek.value = false
  }
}

const saveOpenAIKey = async () => {
  if (!openaiKey.value.trim()) {
    ElMessage.warning('请输入OpenAI API密钥')
    return
  }

  try {
    isLoadingOpenAI.value = true

    if (!window.electronAPI?.apiKeys) {
      ElMessage.error('API Keys功能不可用')
      return
    }

    // 验证密钥
    const isValid = await window.electronAPI.apiKeys.validateOpenAI(openaiKey.value)
    if (isValid) {
      // 保存密钥
      await window.electronAPI.apiKeys.set('openai', openaiKey.value)
      openaiValidated.value = true
      ElMessage.success('OpenAI API密钥已保存并验证通过')
    } else {
      ElMessage.error('OpenAI API密钥验证失败，请检查密钥是否正确')
      openaiValidated.value = false
    }
  } catch (error: any) {
    console.error('[SettingsPage] Failed to save OpenAI API key:', error)
    ElMessage.error(`保存OpenAI API密钥失败: ${error.message || '未知错误'}`)
    openaiValidated.value = false
  } finally {
    isLoadingOpenAI.value = false
  }
}

// 删除API密钥
const deleteApiKey = async (provider: 'deepseek' | 'openai') => {
  try {
    if (!window.electronAPI?.apiKeys?.deleteApiKey) {
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
    
    const result = await window.electronAPI.apiKeys.deleteApiKey(provider)
    if (result) {
      ElMessage.success('API密钥已删除')
      // 更新状态
      if (provider === 'deepseek') {
        deepseekKey.value = ''
        deepseekValidated.value = false
      } else {
        openaiKey.value = ''
        openaiValidated.value = false
      }
    } else {
      ElMessage.error('删除API密钥失败')
    }
  } catch (error) {
    // 用户取消操作
    if (error !== 'cancel') {
      console.error(`[SettingsPage] Failed to delete ${provider} API key:`, error)
      ElMessage.error('删除API密钥失败')
    }
  }
}

// 生命周期钩子
onMounted(async () => {
  await loadKeys()
})
</script>

<template>
  <div class="settings-container">
    <div class="header">
      <div class="title">
        <span class="icon">⚙️</span> 设置
      </div>
    </div>
    
    <div class="settings-content">
      <el-card class="settings-section">
        <template #header>
          <div class="section-header">
            <el-icon><Key /></el-icon> API Keys
          </div>
        </template>
        
        <div class="api-key-section">
          <h3>DeepSeek API</h3>
          <div class="api-key-form">
            <el-input
              v-model="deepseekKey"
              placeholder="请输入DeepSeek API密钥"
              show-password
              :class="{ 'validated': deepseekValidated }"
            />
            <el-button 
              type="primary" 
              :loading="isLoadingDeepseek"
              @click="saveDeepseekKey"
            >
              保存并验证
            </el-button>
            <el-button 
              v-if="deepseekValidated"
              type="danger" 
              :icon="Delete"
              @click="deleteApiKey('deepseek')"
            >
              删除
            </el-button>
          </div>
          <p class="api-key-hint">
            <span v-if="deepseekValidated" class="validated-hint">✓ API密钥已验证</span>
            <span v-else>请输入有效的DeepSeek API密钥</span>
          </p>
        </div>
        
        <div class="api-key-section">
          <h3>OpenAI API</h3>
          <div class="api-key-form">
            <el-input
              v-model="openaiKey"
              placeholder="请输入OpenAI API密钥"
              show-password
              :class="{ 'validated': openaiValidated }"
            />
            <el-button 
              type="primary" 
              :loading="isLoadingOpenAI"
              @click="saveOpenAIKey"
            >
              保存并验证
            </el-button>
            <el-button 
              v-if="openaiValidated"
              type="danger" 
              :icon="Delete"
              @click="deleteApiKey('openai')"
            >
              删除
            </el-button>
          </div>
          <p class="api-key-hint">
            <span v-if="openaiValidated" class="validated-hint">✓ API密钥已验证</span>
            <span v-else>请输入有效的OpenAI API密钥</span>
          </p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
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
  font-size: 18px;
  font-weight: bold;
}

.icon {
  margin-right: 8px;
}

.settings-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}

.settings-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: bold;
}

.api-key-section {
  margin-bottom: 24px;
}

.api-key-section h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 15px;
}

.api-key-form {
  display: flex;
  gap: 10px;
}

.api-key-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.validated-hint {
  color: #67c23a;
  font-weight: bold;
}

.validated {
  border-color: #67c23a;
}
</style> 