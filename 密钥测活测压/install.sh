#!/bin/bash

echo "========================================"
echo "Gemini密钥测活测压工具 - 安装脚本"
echo "========================================"

# 检查Node.js安装
echo "检查Node.js安装..."
if ! command -v node &> /dev/null; then
    echo "错误: 未检测到Node.js"
    echo "请先安装Node.js: https://nodejs.org/"
    echo "或者使用包管理器安装:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  CentOS/RHEL: sudo yum install nodejs npm"
    exit 1
fi

echo "Node.js已安装，版本:"
node --version

echo ""
echo "检查npm安装..."
if ! command -v npm &> /dev/null; then
    echo "错误: 未检测到npm"
    echo "请重新安装Node.js"
    exit 1
fi

echo "npm已安装，版本:"
npm --version

echo ""
echo "安装项目依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    exit 1
fi

echo ""
echo "安装完成！"
echo ""
echo "启动应用:"
echo "npm start"
echo ""
echo "或者使用开发模式:"
echo "npm run dev"
echo ""
echo "使用PM2部署（推荐）:"
echo "npm install -g pm2"
echo "pm2 start ecosystem.config.js --env production"
echo ""


