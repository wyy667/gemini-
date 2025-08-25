#!/bin/bash

echo "========================================"
echo "Gemini密钥测活测压工具 - 完整部署脚本"
echo "========================================"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "错误: 请使用root权限运行此脚本"
    echo "请运行: sudo ./deploy.sh"
    exit 1
fi

# 项目路径
PROJECT_PATH="/root/密钥测活测压"

echo "项目路径: $PROJECT_PATH"

# 1. 安装Node.js
echo "步骤1: 安装Node.js..."
if ! command -v node &> /dev/null; then
    echo "安装NodeSource仓库..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    
    echo "安装Node.js..."
    yum install -y nodejs
    
    if [ $? -ne 0 ]; then
        echo "错误: Node.js安装失败"
        exit 1
    fi
else
    echo "Node.js已安装，版本: $(node --version)"
fi

# 2. 进入项目目录
echo "步骤2: 进入项目目录..."
cd "$PROJECT_PATH"

if [ $? -ne 0 ]; then
    echo "错误: 无法进入项目目录"
    exit 1
fi

# 3. 安装依赖
echo "步骤3: 安装项目依赖..."
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        echo "错误: 依赖安装失败"
        exit 1
    fi
else
    echo "依赖已安装"
fi

# 4. 安装PM2
echo "步骤4: 安装PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo "错误: PM2安装失败"
        exit 1
    fi
else
    echo "PM2已安装，版本: $(pm2 --version)"
fi

# 5. 停止已存在的应用
echo "步骤5: 停止已存在的应用..."
pm2 stop gemini-tester 2>/dev/null
pm2 delete gemini-tester 2>/dev/null

# 6. 启动应用
echo "步骤6: 启动应用..."
pm2 start ecosystem.config.js --env production

# 7. 保存PM2配置
pm2 save

# 8. 设置开机自启
echo "步骤7: 设置开机自启..."

# 创建systemd服务文件
SERVICE_NAME="gemini-tester"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Gemini密钥测活测压工具
After=network.target

[Service]
Type=forking
User=root
WorkingDirectory=$PROJECT_PATH
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload $SERVICE_NAME
ExecStop=/usr/bin/pm2 stop $SERVICE_NAME
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 设置服务文件权限
chmod 644 "$SERVICE_FILE"

# 重新加载systemd
systemctl daemon-reload

# 启用服务
systemctl enable $SERVICE_NAME

# 启动服务
systemctl start $SERVICE_NAME

# 9. 配置防火墙
echo "步骤8: 配置防火墙..."
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --reload
    echo "防火墙已配置"
elif command -v ufw &> /dev/null; then
    ufw allow 3000
    echo "防火墙已配置"
else
    echo "警告: 未检测到防火墙，请手动开放3000端口"
fi

# 10. 显示结果
echo ""
echo "========================================"
echo "部署完成！"
echo "========================================"
echo ""
echo "应用状态:"
pm2 status

echo ""
echo "服务状态:"
systemctl status $SERVICE_NAME --no-pager

echo ""
echo "访问地址:"
echo "  本地访问: http://localhost:3000"
echo "  外部访问: http://$(curl -s ifconfig.me):3000"
echo "  健康检查: http://localhost:3000/health"
echo ""
echo "管理命令:"
echo "  查看应用状态: pm2 status"
echo "  查看应用日志: pm2 logs gemini-tester"
echo "  重启应用: pm2 restart gemini-tester"
echo "  停止应用: pm2 stop gemini-tester"
echo ""
echo "系统服务管理:"
echo "  启动服务: systemctl start $SERVICE_NAME"
echo "  停止服务: systemctl stop $SERVICE_NAME"
echo "  重启服务: systemctl restart $SERVICE_NAME"
echo "  查看状态: systemctl status $SERVICE_NAME"
echo "  查看日志: journalctl -u $SERVICE_NAME -f"
echo "  禁用自启: systemctl disable $SERVICE_NAME"
echo ""
echo "开机自启已启用！"
echo "========================================"


