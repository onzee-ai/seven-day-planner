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

# 检查系统环境依赖
check_system_requirements() {
  echo "检查系统环境..."
  
  # 检查Node.js是否安装
  if ! command -v node &> /dev/null; then
    echo "错误: 未检测到Node.js"
    echo "请从https://nodejs.org下载并安装Node.js v16.x或更高版本"
    exit 1
  fi
  
  # 检查Node.js版本
  NODE_VERSION=$(node -v | cut -d 'v' -f 2)
  NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d '.' -f 1)
  
  if [ "$NODE_MAJOR_VERSION" -lt 16 ]; then
    echo "错误: Node.js版本过低 (当前: v$NODE_VERSION)"
    echo "请升级到Node.js v16.x或更高版本"
    exit 1
  else
    echo "Node.js版本检查通过: v$NODE_VERSION"
  fi
  
  # 检查npm是否安装
  if ! command -v npm &> /dev/null; then
    echo "错误: 未检测到npm"
    echo "npm通常随Node.js一起安装，请检查您的Node.js安装"
    exit 1
  fi
  
  # 检查npm版本
  NPM_VERSION=$(npm -v)
  NPM_MAJOR_VERSION=$(echo $NPM_VERSION | cut -d '.' -f 1)
  
  if [ "$NPM_MAJOR_VERSION" -lt 8 ]; then
    echo "警告: npm版本较低 (当前: $NPM_VERSION)"
    echo "建议升级到npm 8.x或更高版本"
    echo "升级命令: npm install -g npm@latest"
    
    read -p "是否现在升级npm? (y/n): " UPGRADE_NPM
    if [[ $UPGRADE_NPM =~ ^[Yy]$ ]]; then
      echo "正在升级npm..."
      npm install -g npm@latest
      echo "npm已升级"
    else
      echo "继续使用当前npm版本..."
    fi
  else
    echo "npm版本检查通过: $NPM_VERSION"
  fi
  
  # 检查Git是否安装
  if ! command -v git &> /dev/null; then
    echo "警告: 未检测到Git"
    echo "Git不是构建必需的，但在开发环境中推荐使用"
  else
    echo "Git检查通过"
  fi
  
  # 根据不同平台检查额外依赖
  case "$(uname -s)" in
    Darwin)
      # macOS特定检查
      echo "检测到macOS操作系统"
      # 检查XCode Command Line Tools
      if ! xcode-select -p &> /dev/null; then
        echo "警告: 未检测到XCode Command Line Tools"
        echo "这可能导致macOS构建问题"
        read -p "是否安装XCode Command Line Tools? (y/n): " INSTALL_XCODE
        if [[ $INSTALL_XCODE =~ ^[Yy]$ ]]; then
          echo "正在安装XCode Command Line Tools..."
          xcode-select --install
          echo "请等待XCode Command Line Tools安装完成，然后重新运行此脚本"
          exit 0
        fi
      else
        echo "XCode Command Line Tools检查通过"
      fi
      ;;
    Linux)
      # Linux特定检查
      echo "检测到Linux操作系统"
      # 检查必要的库
      MISSING_LIBS=false
      
      # 检查常见的构建依赖
      for pkg in libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1; do
        if ! dpkg -l | grep -q $pkg; then
          echo "警告: 未检测到 $pkg"
          MISSING_LIBS=true
        fi
      done
      
      if [ "$MISSING_LIBS" = true ]; then
        echo "一些构建Electron应用所需的依赖包缺失"
        echo "在Ubuntu/Debian系统，可以运行:"
        echo "sudo apt-get install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1"
        read -p "是否尝试自动安装这些依赖? (y/n): " INSTALL_LIBS
        if [[ $INSTALL_LIBS =~ ^[Yy]$ ]]; then
          echo "正在安装依赖..."
          sudo apt-get update
          sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1
        fi
      else
        echo "系统库依赖检查通过"
      fi
      ;;
    MINGW*|MSYS*)
      # Windows特定检查
      echo "检测到Windows操作系统"
      # Windows下一般不需要特别的系统依赖
      ;;
  esac
  
  echo "系统环境检查完成"
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
      echo "项目依赖检查通过"
    fi
  fi
  
  # 检查全局依赖
  if ! npm list -g electron-builder &> /dev/null; then
    echo "正在安装全局electron-builder..."
    npm install -g electron-builder
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
  echo "=============================================="
  echo "七日计划 (Seven Day Planner) 应用打包工具"
  echo "=============================================="
  
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
  
  # 运行系统环境检查
  check_system_requirements
  
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