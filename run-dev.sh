#!/bin/bash

# 设置错误处理
set -e

# 清理功能
cleanup() {
  echo "清理进程..."
  # 杀死 Vite 进程
  if [ ! -z "$vite_pid" ]; then
    echo "关闭 Vite 服务器 (PID: $vite_pid)"
    kill $vite_pid 2>/dev/null || true
  fi
  
  # 杀死所有 Electron 进程
  echo "关闭所有 Electron 进程"
  pkill -f Electron 2>/dev/null || true
  
  echo "清理完成"
  exit 0
}

# 注册清理函数
trap cleanup EXIT INT TERM

# 关闭可能已经运行的进程
echo "关闭现有的进程..."
pkill -f Electron 2>/dev/null || true
pkill -f vite 2>/dev/null || true
sleep 1

# 清理旧的构建文件
echo "清理旧的构建文件..."
rm -rf dist-electron

# 启动 Vite 服务器并等待（不再单独启动 Electron）
echo "启动 Vite 开发服务器..."
npm run dev

# Vite 会自己启动 Electron，所以这里不需要额外的命令
# 清理会由 trap 处理 