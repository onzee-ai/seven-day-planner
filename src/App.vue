<script setup lang="ts">
// App.vue现在只作为路由容器
import { onBeforeUnmount, provide, ref, watchEffect } from 'vue'
import { useRouter, RouteLocationNormalizedLoaded } from 'vue-router'

// 获取路由
const router = useRouter()

// 当前路由组件状态
const componentState = ref({
  active: true,
  currentRoute: null as RouteLocationNormalizedLoaded | null
})

// 提供一个清理函数的注册机制
const cleanupFunctions = ref<Array<() => void>>([])

// 注册清理函数的方法
const registerCleanup = (fn: () => void) => {
  cleanupFunctions.value.push(fn)
}

// 执行所有清理函数的方法
const runAllCleanups = () => {
  cleanupFunctions.value.forEach(fn => {
    try {
      fn()
    } catch (error) {
      console.error('Error in cleanup function:', error)
    }
  })
  cleanupFunctions.value = []
}

// 在路由变化前清理组件
watchEffect(() => {
  const route = router.currentRoute.value
  if (componentState.value.currentRoute && 
      componentState.value.currentRoute.path !== route.path) {
    // 路由变化时执行清理
    runAllCleanups()
  }
  componentState.value.currentRoute = route
})

// 将注册方法提供给子组件
provide('registerCleanup', registerCleanup)
provide('componentState', componentState)

// 在组件卸载前执行所有清理函数
onBeforeUnmount(() => {
  componentState.value.active = false
  runAllCleanups()
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <keep-alive :max="3">
        <component :is="Component" :key="$route.path" />
      </keep-alive>
    </transition>
  </router-view>
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* 添加过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>