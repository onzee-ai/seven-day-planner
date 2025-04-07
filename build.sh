#!/bin/bash

# 设置错误处理
set -e

# 显示使用方法
show_usage() {
  echo "使用方法: ./build.sh [选项]"
  echo "选项:"
  echo "  --all     为所有平台构建 (Mac, Windows, Linux)"
  echo "  --mac     仅为 macOS 构建"
  echo "  --win     仅为 Windows 构建"
  echo "  --linux   仅为 Linux 构建"
  echo "  --help    显示此帮助信息"
  echo ""
  echo "示例: ./build.sh --mac     # 仅为 macOS 构建"
  echo "      ./build.sh --all     # 为所有平台构建"
}

# 检查依赖是否已安装
check_and_install_dependencies() {
  echo "检查项目依赖..."
  
  # 检查node_modules目录是否存在
  if [ ! -d "node_modules" ]; then
    echo "未发现node_modules目录，正在安装依赖..."
    npm install
  else
    # 检查关键依赖是否存在
    if ! npm list electron-builder > /dev/null 2>&1; then
      echo "打包依赖不完整，正在安装依赖..."
      npm install
    else
      echo "依赖检查通过"
    fi
  fi
}

# 清理旧的构建文件
clean_old_builds() {
  echo "清理旧的构建文件..."
  rm -rf dist dist-electron release
}

# 为指定平台构建
build_for_platform() {
  platform=$1
  echo "开始为 $platform 平台构建..."
  
  case "$platform" in
    mac)
      # 为macOS构建
      npm run build -- --mac
      ;;
    win)
      # 为Windows构建
      npm run build -- --win
      ;;
    linux)
      # 为Linux构建
      npm run build -- --linux
      ;;
    all)
      # 为所有平台构建
      npm run build -- --mac --win --linux
      ;;
    *)
      echo "错误: 未知平台 '$platform'"
      show_usage
      exit 1
      ;;
  esac
  
  echo "$platform 平台构建完成!"
}

# 主函数
main() {
  # 如果没有参数，显示帮助信息
  if [ $# -eq 0 ]; then
    show_usage
    exit 0
  fi
  
  # 处理命令行参数
  while [ $# -gt 0 ]; do
    case "$1" in
      --mac)
        platform="mac"
        ;;
      --win)
        platform="win"
        ;;
      --linux)
        platform="linux"
        ;;
      --all)
        platform="all"
        ;;
      --help)
        show_usage
        exit 0
        ;;
      *)
        echo "错误: 未知选项 '$1'"
        show_usage
        exit 1
        ;;
    esac
    shift
  done
  
  # 运行依赖检查
  check_and_install_dependencies
  
  # 清理旧的构建文件
  clean_old_builds
  
  # 构建应用
  build_for_platform "$platform"
  
  echo "==============================================="
  echo "构建完成! 请在 'release' 目录查看打包后的文件。"
  echo "==============================================="
}

# 执行主函数
main "$@" 