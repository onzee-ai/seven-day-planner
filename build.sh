#!/bin/bash

# 设置错误处理
set -e

# 应用版本（与package.json和README.md保持一致）
APP_VERSION="1.2.0"
BUILD_DATE=$(date +"%Y年%m月%d日")

# 显示使用方法
show_usage() {
  echo "=============================================="
  echo "七日计划 (Seven Day Planner) 应用打包工具 v${APP_VERSION}"
  echo "=============================================="
  echo "使用方法: ./build.sh [选项]"
  echo "选项:"
  echo "  --all     为所有平台构建 (Mac, Windows)"
  echo "  --mac     仅为 macOS 构建"
  echo "  --win     仅为 Windows 构建"
  echo "  --clean   仅清理构建产物"
  echo "  --version 显示当前版本"
  echo "  --help    显示此帮助信息"
  echo ""
  echo "示例: ./build.sh --mac     # 仅为 macOS 构建"
  echo "      ./build.sh --all     # 为所有平台构建"
  echo "      ./build.sh --clean   # 仅清理构建产物"
}

# 显示版本信息
show_version() {
  echo "七日计划 (Seven Day Planner) v${APP_VERSION}"
  echo "构建日期: ${BUILD_DATE}"
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
      echo "注意: 当前脚本不再支持Linux构建"
      echo "请使用 --mac 或 --win 选项"
      ;;
    MINGW*|MSYS*)
      # Windows特定检查
      echo "检测到Windows操作系统"
      # Windows下一般不需要特别的系统依赖
      ;;
  esac
  
  echo "系统环境检查完成"
}

# 同步版本号到package.json
update_version_in_package() {
  echo "正在同步版本号到package.json..."
  
  # 检查是否存在sed命令
  if ! command -v sed &> /dev/null; then
    echo "警告: 未检测到sed命令，无法更新版本号"
    return
  fi
  
  # 获取当前package.json中的版本号
  CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' package.json | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
  
  if [ "$CURRENT_VERSION" != "$APP_VERSION" ]; then
    echo "更新版本号: $CURRENT_VERSION -> $APP_VERSION"
    
    # macOS与其他系统的sed命令略有不同
    if [ "$(uname -s)" = "Darwin" ]; then
      sed -i '' 's/"version": *"[^"]*"/"version": "'$APP_VERSION'"/' package.json
    else
      sed -i 's/"version": *"[^"]*"/"version": "'$APP_VERSION'"/' package.json
    fi
    
    echo "版本号已更新"
  else
    echo "版本号已是最新: $APP_VERSION"
  fi
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

# 清理旧的构建文件，但保留release目录
clean_old_builds() {
  echo "清理旧的构建文件..."
  
  if [ -d "dist" ] || [ -d "dist-electron" ]; then
    rm -rf dist dist-electron
    echo "已清理dist和dist-electron目录"
  else
    echo "无需清理：dist和dist-electron目录不存在"
  fi
  
  # 不再删除release目录，而是在其中创建平台子目录
  mkdir -p release/mac release/win
}

# 清理不必要的构建数据
clean_build_artifacts() {
  echo "清理构建过程中产生的临时文件..."
  
  # 清理构建目录
  if [ -d "dist" ]; then
    echo "清理 dist 目录..."
    rm -rf dist
  fi
  
  if [ -d "dist-electron" ]; then
    echo "清理 dist-electron 目录..."
    rm -rf dist-electron
  fi
  
  # 清理可能存在的缓存文件
  if [ -d ".electron-builder-cache" ]; then
    echo "清理 .electron-builder-cache 目录..."
    rm -rf .electron-builder-cache
  fi
  
  if [ -d ".webpack" ]; then
    echo "清理 .webpack 目录..."
    rm -rf .webpack
  fi
  
  # 清理其他可能的临时文件
  echo "清理其他临时文件..."
  find . -name "*.tsbuildinfo" -delete
  find . -name ".DS_Store" -delete
  
  echo "构建临时文件清理完成"
  
  # 如果需要更彻底的清理，可以取消下面注释(不推荐用于开发环境)
  # echo "注意: 是否清理node_modules? 这将移除所有依赖，后续构建需要重新安装"
  # read -p "是否清理node_modules? (y/n): " CLEAN_MODULES
  # if [[ $CLEAN_MODULES =~ ^[Yy]$ ]]; then
  #   echo "清理node_modules..."
  #   rm -rf node_modules
  # fi
}

# 为指定平台构建
build_for_platform() {
  platform=$1
  echo "开始为 $platform 平台构建..."
  
  # 在构建前同步版本号
  update_version_in_package
  
  case "$platform" in
    mac)
      # 为macOS构建
      echo "正在为macOS构建v${APP_VERSION}版本..."
      npm run build -- --mac
      
      # 创建版本子目录用于归档
      VERSION_DIR="release/mac/v${APP_VERSION}"
      mkdir -p "$VERSION_DIR"
      
      # 移动构建结果到对应平台文件夹
      echo "移动macOS构建结果到$VERSION_DIR目录..."
      find release -maxdepth 1 -type f -name "*.dmg" -o -name "*.zip" | xargs -I {} mv {} "$VERSION_DIR/"
      
      # 创建版本信息文件
      echo "创建版本信息文件..."
      echo "版本: v${APP_VERSION}" > "$VERSION_DIR/version-info.txt"
      echo "构建日期: ${BUILD_DATE}" >> "$VERSION_DIR/version-info.txt"
      echo "平台: macOS" >> "$VERSION_DIR/version-info.txt"
      ;;
    win)
      # 为Windows构建
      echo "正在为Windows构建v${APP_VERSION}版本..."
      npm run build -- --win
      
      # 创建版本子目录用于归档
      VERSION_DIR="release/win/v${APP_VERSION}"
      mkdir -p "$VERSION_DIR"
      
      # 移动构建结果到对应平台文件夹
      echo "移动Windows构建结果到$VERSION_DIR目录..."
      find release -maxdepth 1 -type f -name "*.exe" -o -name "*.msi" | xargs -I {} mv {} "$VERSION_DIR/"
      
      # 创建版本信息文件
      echo "创建版本信息文件..."
      echo "版本: v${APP_VERSION}" > "$VERSION_DIR/version-info.txt"
      echo "构建日期: ${BUILD_DATE}" >> "$VERSION_DIR/version-info.txt"
      echo "平台: Windows" >> "$VERSION_DIR/version-info.txt"
      ;;
    all)
      # 为所有平台构建
      # 先构建各个平台
      build_for_platform "mac"
      build_for_platform "win"
      # 由于我们已经在每个平台构建后移动了文件，这里不需要额外操作
      echo "所有平台构建完成，结果已保存到各自目录!"
      return
      ;;
    *)
      echo "错误: 未知平台 '$platform'"
      show_usage
      exit 1
      ;;
  esac
  
  echo "$platform 平台v${APP_VERSION}版本构建完成!"
}

# 主函数
main() {
  # 处理命令行参数
  if [ $# -eq 0 ]; then
    show_usage
    exit 1
  fi

  while [ "$1" != "" ]; do
    case $1 in
      --mac )    build_for_platform "mac"
                 ;;
      --win )    build_for_platform "win"
                 ;;
      --all )    build_for_platform "all"
                 ;;
      --clean )  clean_build_artifacts
                 ;;
      --version ) show_version
                  exit 0
                  ;;
      --help )   show_usage
                 exit 0
                 ;;
      * )        echo "错误: 未知选项 '$1'"
                 show_usage
                 exit 1
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
  
  # 清理构建产生的临时文件
  clean_build_artifacts
  
  echo "==============================================="
  echo "七日计划 (Seven Day Planner) v${APP_VERSION} 构建完成!"
  echo "构建日期: ${BUILD_DATE}"
  echo "请在 'release' 目录查看打包后的文件。"
  echo "==============================================="
}

# 执行主函数
main "$@" 