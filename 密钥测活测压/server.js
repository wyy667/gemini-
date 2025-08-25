const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// 存储测压任务的数据结构
const stressTests = new Map(); // key: apiKey, value: {status, startTime, successCount, totalCount, intervalId}

// 存储测试进度的数据结构
const testProgress = new Map(); // key: sessionId, value: {total, tested, valid, invalid, completed, finalResults}

// 定期清理已完成的进度数据（每小时清理一次）
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, progress] of testProgress.entries()) {
        if (progress.completed && (now - progress.completedTime) > 3600000) { // 1小时后清理
            testProgress.delete(sessionId);
        }
    }
}, 3600000); // 每小时检查一次

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 测试单个密钥
async function testKey(apiKey, endpoint, model) {
    try {
        const response = await axios.post(`${endpoint}/chat/completions`, {
            model: model,
            messages: [
                {
                    role: "user",
                    content: "Hello, please respond with 'OK' if you can see this message."
                }
            ],
            max_tokens: 10
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        return { success: true, status: response.status, data: response.data };
    } catch (error) {
        return { 
            success: false, 
            status: error.response?.status || 0,
            error: error.response?.data?.error?.message || error.message 
        };
    }
}

// 批量测试密钥
app.post('/api/test-keys', async (req, res) => {
    try {
        const { keys, endpoint, model, concurrency, retries } = req.body;
        
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
            return res.status(400).json({ error: '请提供有效的密钥列表' });
        }
        
        const validKeys = keys.filter(key => key.trim() !== '');
        const sessionId = Date.now().toString();
        
        // 初始化进度跟踪
        testProgress.set(sessionId, {
            total: validKeys.length,
            tested: 0,
            valid: 0,
            invalid: 0
        });
        
        const results = {
            valid: [],
            invalid: {},
            total: validKeys.length,
            tested: 0,
            sessionId: sessionId
        };
        
        // 限制并发数
        const maxConcurrency = Math.min(concurrency || 5, 50);
        const maxRetries = Math.min(retries || 1, 3);
        
        // 分批处理
        for (let i = 0; i < validKeys.length; i += maxConcurrency) {
            const batch = validKeys.slice(i, i + maxConcurrency);
            const promises = batch.map(async (key) => {
                let lastResult = null;
                
                // 重试逻辑
                for (let retry = 0; retry <= maxRetries; retry++) {
                    lastResult = await testKey(key, endpoint, model);
                    if (lastResult.success) break;
                    if (retry < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                return { key, result: lastResult };
            });
            
            const batchResults = await Promise.all(promises);
            
            batchResults.forEach(({ key, result }) => {
                results.tested++;
                
                // 更新进度
                const progress = testProgress.get(sessionId);
                if (progress) {
                    progress.tested++;
                    if (result.success) {
                        progress.valid++;
                        results.valid.push(key);
                    } else {
                        progress.invalid++;
                        const status = result.status.toString();
                        if (!results.invalid[status]) {
                            results.invalid[status] = [];
                        }
                        results.invalid[status].push(key);
                    }
                }
            });
        }
        
        // 标记进度为完成状态，但不立即删除
        const progress = testProgress.get(sessionId);
        if (progress) {
            progress.completed = true;
            progress.completedTime = Date.now();
            progress.finalResults = results;
        }
        
        res.json(results);
    } catch (error) {
        console.error('测试密钥时出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 查询测试进度
app.get('/api/test-progress/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const progress = testProgress.get(sessionId);
        
        if (!progress) {
            return res.status(404).json({ error: '未找到测试进度' });
        }
        
        // 如果测试已完成，返回完成状态和最终结果
        if (progress.completed) {
            res.json({
                ...progress,
                completed: true,
                finalResults: progress.finalResults
            });
        } else {
            res.json(progress);
        }
    } catch (error) {
        console.error('查询测试进度时出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取公告内容
app.get('/api/announcement', (req, res) => {
    try {
        const announcementPath = '/root/密钥测活测压/公告.txt';
        
        if (fs.existsSync(announcementPath)) {
            const content = fs.readFileSync(announcementPath, 'utf8');
            res.json({ 
                hasAnnouncement: true, 
                content: content.trim() 
            });
        } else {
            res.json({ 
                hasAnnouncement: false, 
                content: '' 
            });
        }
    } catch (error) {
        console.error('读取公告文件失败:', error);
        res.json({ 
            hasAnnouncement: false, 
            content: '公告文件读取失败' 
        });
    }
});

// 开始后台压力测试
app.post('/api/stress-test/start', async (req, res) => {
    try {
        const { apiKey, endpoint, model } = req.body;
        
        if (!apiKey) {
            return res.status(400).json({ error: '请提供有效的API密钥' });
        }
        
        // 检查是否已经在测压
        if (stressTests.has(apiKey)) {
            const existingTest = stressTests.get(apiKey);
            if (existingTest.status === 'running') {
                return res.status(400).json({ error: '该密钥正在测压中，请稍后再试' });
            }
        }
        
        // 创建新的测压任务
        const testData = {
            status: 'running',
            startTime: Date.now(),
            successCount: 0,
            totalCount: 0,
            endpoint: endpoint,
            model: model,
            intervalId: null
        };
        
        stressTests.set(apiKey, testData);
        
        // 开始后台测压（30秒一次）
        const intervalId = setInterval(async () => {
            const currentTest = stressTests.get(apiKey);
            if (!currentTest || currentTest.status !== 'running') {
                clearInterval(intervalId);
                return;
            }
            
            currentTest.totalCount++;
            
            try {
                const result = await testKey(apiKey, endpoint, model);
                if (result.success) {
                    currentTest.successCount++;
                }
            } catch (error) {
                console.error('测压请求失败:', error);
            }
            
            // 检查是否达到2小时
            const elapsedTime = Date.now() - currentTest.startTime;
            if (elapsedTime >= 2 * 60 * 60 * 1000) { // 2小时
                currentTest.status = 'completed';
                clearInterval(intervalId);
                console.log(`密钥测压完成: ${apiKey}, 成功次数: ${currentTest.successCount}, 总次数: ${currentTest.totalCount}`);
            }
        }, 30000); // 30秒
        
        testData.intervalId = intervalId;
        
        // 设置24小时后自动清理
        setTimeout(() => {
            if (stressTests.has(apiKey)) {
                stressTests.delete(apiKey);
                console.log(`密钥测压数据已清理: ${apiKey}`);
            }
        }, 24 * 60 * 60 * 1000); // 24小时
        
        res.json({ 
            success: true,
            message: '密钥正在持续测压，你可以退出网页随时返回点击查询按钮查看密钥当前情况',
            startTime: testData.startTime
        });
        
    } catch (error) {
        console.error('启动压力测试时出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 查询测压状态
app.post('/api/stress-test/query', async (req, res) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            return res.status(400).json({ error: '请提供有效的API密钥' });
        }
        
        const testData = stressTests.get(apiKey);
        
        if (!testData) {
            return res.json({
                found: false,
                message: '未找到该密钥的测压记录'
            });
        }
        
        const elapsedTime = Date.now() - testData.startTime;
        const elapsedMinutes = Math.floor(elapsedTime / (60 * 1000));
        const remainingMinutes = Math.max(0, 120 - elapsedMinutes); // 2小时 = 120分钟
        
        // 计算密钥评分
        let rating = '';
        if (testData.status === 'completed') {
            if (testData.successCount <= 30) {
                rating = '绝壁超开密钥';
            } else if (testData.successCount <= 40) {
                rating = '可能是超开密钥';
            } else if (testData.successCount <= 50) {
                rating = '密钥合格';
            } else {
                rating = '很强的密钥';
            }
        }
        
        res.json({
            found: true,
            status: testData.status,
            successCount: testData.successCount,
            totalCount: testData.totalCount,
            elapsedMinutes: elapsedMinutes,
            remainingMinutes: remainingMinutes,
            rating: rating,
            startTime: testData.startTime
        });
        
    } catch (error) {
        console.error('查询压力测试状态时出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 中断测压
app.post('/api/stress-test/stop', async (req, res) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            return res.status(400).json({ error: '请提供有效的API密钥' });
        }
        
        const testData = stressTests.get(apiKey);
        
        if (!testData) {
            return res.status(404).json({ error: '未找到该密钥的测压记录' });
        }
        
        if (testData.status !== 'running') {
            return res.status(400).json({ error: '该密钥未在测压中' });
        }
        
        // 停止测压
        if (testData.intervalId) {
            clearInterval(testData.intervalId);
        }
        
        testData.status = 'stopped';
        
        res.json({
            success: true,
            message: '测压已中断',
            successCount: testData.successCount,
            totalCount: testData.totalCount
        });
        
    } catch (error) {
        console.error('中断压力测试时出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 主页
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('请求主页，文件路径:', indexPath);
    
    // 检查文件是否存在
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        console.error('index.html文件不存在:', indexPath);
        res.status(404).send('页面文件未找到');
    }
});

// 添加健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: '服务器运行正常' });
});

// 添加API测试端点
app.get('/api/test', (req, res) => {
    res.json({ message: 'API服务器运行正常' });
});

// 处理404错误
app.use((req, res) => {
    console.log('404错误 - 请求路径:', req.path);
    res.status(404).json({ error: '请求的路径未找到', path: req.path });
});

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`健康检查: http://localhost:${PORT}/health`);
    console.log(`API测试: http://localhost:${PORT}/api/test`);
});
