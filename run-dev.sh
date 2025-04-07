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

# 检查依赖是否已安装
check_and_install_dependencies() {
  echo "检查项目依赖..."
  
  # 检查node_modules目录是否存在
  if [ ! -d "node_modules" ]; then
    echo "未发现node_modules目录，正在安装依赖..."
    npm install
  else
    # 检查关键依赖是否存在
    if ! npm list vite > /dev/null 2>&1 || ! npm list electron > /dev/null 2>&1; then
      echo "依赖不完整或已损坏，正在重新安装..."
      npm install
    else
      echo "依赖检查通过"
    fi
  fi
}

# 运行依赖检查
check_and_install_dependencies

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