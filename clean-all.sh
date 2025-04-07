#!/bin/bash

echo "============================================================"
echo "强力清理所有 Electron 相关进程"
echo "============================================================"

# 查找所有可能的 Electron 进程
echo "查找所有 Electron 相关进程..."
electron_procs=$(ps aux | grep -i electron | grep -v grep | awk '{print $2}')
vite_procs=$(ps aux | grep -i vite | grep -v grep | awk '{print $2}')
node_procs=$(ps aux | grep -i node | grep 'dist-electron/main' | grep -v grep | awk '{print $2}')

# 列出找到的进程
if [ ! -z "$electron_procs" ]; then
  echo "找到 Electron 进程: $electron_procs"
else
  echo "没有找到 Electron 进程"
fi

if [ ! -z "$vite_procs" ]; then
  echo "找到 Vite 进程: $vite_procs"
else
  echo "没有找到 Vite 进程"
fi

if [ ! -z "$node_procs" ]; then
  echo "找到 Node 进程 (运行 Electron): $node_procs"
else
  echo "没有找到 Node 进程 (运行 Electron)"
fi

# 杀死所有找到的进程
for pid in $electron_procs $vite_procs $node_procs; do
  echo "正在结束进程 $pid..."
  kill -9 $pid 2>/dev/null || true
done

echo "正在使用 pkill 确保所有 Electron 进程都已终止..."
pkill -f Electron 2>/dev/null || true
pkill -f vite 2>/dev/null || true
pkill -f "dist-electron/main" 2>/dev/null || true

echo "清理文件..."
rm -rf dist-electron

echo "============================================================"
echo "清理完成"
echo "============================================================"

# 提供运行指令
echo "要启动应用，请运行: ./run-dev.sh" 