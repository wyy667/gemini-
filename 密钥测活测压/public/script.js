// 全局变量
let testResults = null;


// DOM元素
const elements = {
    // 标签页
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    
    // 测活面板
    confirmConfig: document.getElementById('confirm-config'),
    keysSection: document.getElementById('keys-section'),
    keysInput: document.getElementById('keys-input'),
    concurrency: document.getElementById('concurrency'),
    retries: document.getElementById('retries'),
    startTest: document.getElementById('start-test'),
    resultsSection: document.getElementById('results-section'),
    
    // 结果展示
    totalKeys: document.getElementById('total-keys'),
    validKeys: document.getElementById('valid-keys'),
    invalidKeys: document.getElementById('invalid-keys'),
    resultTabBtns: document.querySelectorAll('.result-tab-btn'),
    validResults: document.getElementById('valid-results'),
    invalidResults: document.getElementById('invalid-results'),
    validKeysList: document.getElementById('valid-keys-list'),
    invalidKeysList: document.getElementById('invalid-keys-list'),
    copyValid: document.getElementById('copy-valid'),
    
    // 压力测试面板
    confirmStressConfig: document.getElementById('confirm-stress-config'),
    stressTestSection: document.getElementById('stress-test-section'),
    stressApiKey: document.getElementById('stress-api-key'),
    startStressTest: document.getElementById('start-stress-test'),
    queryStressTest: document.getElementById('query-stress-test'),
    
    // 进度条元素
    testProgress: document.getElementById('test-progress'),
    testedCount: document.getElementById('tested-count'),
    totalTestCount: document.getElementById('total-test-count'),
    testProgressPercent: document.getElementById('test-progress-percent'),
    testProgressFill: document.getElementById('test-progress-fill'),
    currentTestStatus: document.getElementById('current-test-status')
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

// 初始化事件监听器
function initializeEventListeners() {
    // 标签页切换
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // 测活配置确认
    elements.confirmConfig.addEventListener('click', showKeysSection);
    
    // 开始测试
    elements.startTest.addEventListener('click', startKeyTest);
    
    // 结果标签页切换
    elements.resultTabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchResultTab(btn.dataset.result));
    });
    
    // 复制有效密钥
    elements.copyValid.addEventListener('click', copyValidKeys);
    
    // 压力测试配置确认
    elements.confirmStressConfig.addEventListener('click', showStressTestSection);
    
    // 压力测试控制
    elements.startStressTest.addEventListener('click', startStressTest);
    elements.queryStressTest.addEventListener('click', queryStressTest);
    
    // 弹窗控制
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('stop-stress-test').addEventListener('click', stopStressTest);
    
    // 点击弹窗外部关闭
    document.getElementById('stress-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    
    // 公告弹窗控制
    document.getElementById('close-announcement').addEventListener('click', closeAnnouncement);
    document.getElementById('close-announcement-btn').addEventListener('click', closeAnnouncement);
    
    // 点击公告弹窗外部关闭
    document.getElementById('announcement-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAnnouncement();
        }
    });
    
    // 页面加载完成后显示公告
    showAnnouncement();
}

// 标签页切换
function switchTab(tabName) {
    // 更新按钮状态
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // 更新面板显示
    elements.tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `${tabName}-panel`);
    });
}

// 显示密钥输入区域
function showKeysSection() {
    const endpoint = document.getElementById('test-endpoint').value.trim();
    const model = document.getElementById('test-model').value.trim();
    
    if (!endpoint || !model) {
        showAlert('请填写完整的配置信息', 'error');
        return;
    }
    
    elements.keysSection.style.display = 'block';
    elements.keysSection.scrollIntoView({ behavior: 'smooth' });
}

// 显示压力测试区域
function showStressTestSection() {
    const endpoint = document.getElementById('stress-endpoint').value.trim();
    const model = document.getElementById('stress-model').value.trim();
    
    if (!endpoint || !model) {
        showAlert('请填写完整的配置信息', 'error');
        return;
    }
    
    elements.stressTestSection.style.display = 'block';
    elements.stressTestSection.scrollIntoView({ behavior: 'smooth' });
}

// 开始密钥测试
async function startKeyTest() {
    const keys = elements.keysInput.value.trim().split('\n').filter(key => key.trim() !== '');
    const concurrency = parseInt(elements.concurrency.value);
    const retries = parseInt(elements.retries.value);
    const endpoint = document.getElementById('test-endpoint').value.trim();
    const model = document.getElementById('test-model').value.trim();
    
    if (keys.length === 0) {
        showAlert('请输入至少一个密钥', 'error');
        return;
    }
    
    if (concurrency < 1 || concurrency > 50) {
        showAlert('并发数必须在1-50之间', 'error');
        return;
    }
    
    if (retries < 0 || retries > 3) {
        showAlert('重试次数必须在0-3之间', 'error');
        return;
    }
    
    // 显示进度条
    showTestProgress(keys.length);
    
    // 显示加载状态
    elements.startTest.innerHTML = '<span class="loading"></span> 测试中...';
    elements.startTest.disabled = true;
    
    try {
        const response = await fetch('/api/test-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                keys: keys,
                endpoint: endpoint,
                model: model,
                concurrency: concurrency,
                retries: retries
            })
        });
        
        if (!response.ok) {
            throw new Error('网络请求失败');
        }
        
        testResults = await response.json();
        
        // 开始进度轮询
        if (testResults.sessionId) {
            pollTestProgress(testResults.sessionId);
        } else {
            // 如果没有sessionId，直接显示结果
            hideTestProgress();
            displayTestResults(testResults);
        }
        
    } catch (error) {
        console.error('测试失败:', error);
        showAlert('测试失败: ' + error.message, 'error');
        hideTestProgress();
    } finally {
        // 恢复按钮状态
        elements.startTest.innerHTML = '开始测试';
        elements.startTest.disabled = false;
    }
}

// 显示测活进度条
function showTestProgress(totalKeys) {
    elements.testProgress.style.display = 'block';
    elements.totalTestCount.textContent = totalKeys;
    elements.testedCount.textContent = '0';
    elements.testProgressPercent.textContent = '0%';
    elements.testProgressFill.style.width = '0%';
    elements.currentTestStatus.textContent = '准备开始测试...';
    
    // 滚动到进度条位置
    elements.testProgress.scrollIntoView({ behavior: 'smooth' });
}

// 隐藏测活进度条
function hideTestProgress() {
    elements.testProgress.style.display = 'none';
}

// 更新测活进度
function updateTestProgress(tested, total, status) {
    const percent = Math.round((tested / total) * 100);
    
    // 更新进度数据
    elements.testedCount.textContent = tested;
    elements.totalTestCount.textContent = total;
    elements.testProgressPercent.textContent = percent + '%';
    elements.testProgressFill.style.width = percent + '%';
    elements.currentTestStatus.textContent = status || `正在测试第 ${tested} 个密钥...`;
    
    // 调试信息
    console.log(`进度更新: ${tested}/${total} (${percent}%) - ${status}`);
}

// 轮询测试进度
async function pollTestProgress(sessionId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/test-progress/${sessionId}`);
            
            if (response.ok) {
                const progress = await response.json();
                updateTestProgress(progress.tested, progress.total, `已测试 ${progress.tested}/${progress.total} 个密钥`);
                
                // 如果测试完成，停止轮询
                if (progress.completed || progress.tested >= progress.total) {
                    clearInterval(pollInterval);
                    setTimeout(() => {
                        hideTestProgress();
                        // 如果有最终结果，直接显示
                        if (progress.finalResults) {
                            displayTestResults(progress.finalResults);
                        } else {
                            console.error('未找到最终测试结果');
                        }
                    }, 1000); // 延迟1秒显示结果
                }
            } else {
                // 如果找不到进度，停止轮询并重新获取结果
                clearInterval(pollInterval);
                hideTestProgress();
                // 重新获取测试结果
                try {
                    const resultResponse = await fetch('/api/test-keys', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId: sessionId })
                    });
                    if (resultResponse.ok) {
                        const finalResults = await resultResponse.json();
                        displayTestResults(finalResults);
                    } else {
                        console.error('获取测试结果失败');
                    }
                } catch (error) {
                    console.error('获取测试结果失败:', error);
                }
            }
        } catch (error) {
            console.error('轮询进度失败:', error);
            clearInterval(pollInterval);
            hideTestProgress();
        }
    }, 500); // 每500ms轮询一次
    
    // 设置超时，避免无限轮询
    setTimeout(() => {
        clearInterval(pollInterval);
        hideTestProgress();
        console.error('测试进度轮询超时');
    }, 300000); // 5分钟超时
}

// 显示测试结果
function displayTestResults(results) {
    // 更新统计信息
    elements.totalKeys.textContent = results.total;
    elements.validKeys.textContent = results.valid.length;
    elements.invalidKeys.textContent = results.total - results.valid.length;
    
    // 显示有效密钥
    elements.validKeysList.innerHTML = '';
    if (results.valid.length > 0) {
        results.valid.forEach(key => {
            const keyItem = document.createElement('div');
            keyItem.className = 'key-item';
            keyItem.textContent = key;
            elements.validKeysList.appendChild(keyItem);
        });
    } else {
        elements.validKeysList.innerHTML = '<p style="color: #666; text-align: center;">暂无有效密钥</p>';
    }
    
    // 显示无效密钥分类
    elements.invalidKeysList.innerHTML = '';
    const invalidCount = Object.keys(results.invalid).length;
    if (invalidCount > 0) {
        Object.entries(results.invalid).forEach(([status, keys]) => {
            const category = document.createElement('div');
            category.className = 'error-category';
            
            const categoryTitle = document.createElement('h5');
            categoryTitle.textContent = `错误码 ${status} (${keys.length}个密钥)`;
            category.appendChild(categoryTitle);
            
            keys.forEach(key => {
                const keyItem = document.createElement('div');
                keyItem.className = 'key-item invalid';
                keyItem.textContent = key;
                category.appendChild(keyItem);
            });
            
            elements.invalidKeysList.appendChild(category);
        });
    } else {
        elements.invalidKeysList.innerHTML = '<p style="color: #666; text-align: center;">暂无无效密钥</p>';
    }
    
    // 显示结果区域
    elements.resultsSection.style.display = 'block';
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// 结果标签页切换
function switchResultTab(resultType) {
    elements.resultTabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.result === resultType);
    });
    
    elements.validResults.classList.toggle('active', resultType === 'valid');
    elements.invalidResults.classList.toggle('active', resultType === 'invalid');
}

// 复制有效密钥
function copyValidKeys() {
    if (!testResults || testResults.valid.length === 0) {
        showAlert('没有可复制的有效密钥', 'error');
        return;
    }
    
    const keysText = testResults.valid.join('\n');
    navigator.clipboard.writeText(keysText).then(() => {
        showAlert('有效密钥已复制到剪贴板', 'success');
    }).catch(() => {
        showAlert('复制失败，请手动复制', 'error');
    });
}

// 开始后台压力测试
async function startStressTest() {
    const apiKey = elements.stressApiKey.value.trim();
    const endpoint = document.getElementById('stress-endpoint').value.trim();
    const model = document.getElementById('stress-model').value.trim();
    
    if (!apiKey) {
        showAlert('请输入API密钥', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/stress-test/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey: apiKey,
                endpoint: endpoint,
                model: model
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '启动压力测试失败');
        }
        
        const result = await response.json();
        showAlert(result.message, 'success');
        
        // 清空输入框
        elements.stressApiKey.value = '';
        
    } catch (error) {
        console.error('压力测试启动失败:', error);
        showAlert('压力测试启动失败: ' + error.message, 'error');
    }
}

// 查询测压状态
async function queryStressTest() {
    const apiKey = elements.stressApiKey.value.trim();
    
    if (!apiKey) {
        showAlert('请输入要查询的API密钥', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/stress-test/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey: apiKey
            })
        });
        
        if (!response.ok) {
            throw new Error('查询失败');
        }
        
        const result = await response.json();
        showStressModal(result);
        
    } catch (error) {
        console.error('查询失败:', error);
        showAlert('查询失败: ' + error.message, 'error');
    }
}

// 显示测压状态弹窗
function showStressModal(data) {
    const modal = document.getElementById('stress-modal');
    const modalContent = document.getElementById('modal-content');
    const stopBtn = document.getElementById('stop-stress-test');
    
    let content = '';
    
    if (!data.found) {
        content = `
            <div class="stress-status">
                <div class="status-item">
                    <span class="status-label">状态:</span>
                    <span class="status-value">未找到测压记录</span>
                </div>
                <p style="color: #ecf0f1; text-align: center; margin-top: 15px;">
                    ${data.message}
                </p>
            </div>
        `;
        stopBtn.style.display = 'none';
    } else {
        const progressPercent = Math.min(100, (data.elapsedMinutes / 60) * 100);
        
        content = `
            <div class="stress-status">
                <div class="status-item">
                    <span class="status-label">状态:</span>
                    <span class="status-value">${getStatusText(data.status)}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">成功次数:</span>
                    <span class="status-value">${data.successCount}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">总次数:</span>
                    <span class="status-value">${data.totalCount}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">已测压时间:</span>
                    <span class="status-value">${data.elapsedMinutes} 分钟</span>
                </div>
                <div class="status-item">
                    <span class="status-label">剩余时间:</span>
                    <span class="status-value">${data.remainingMinutes} 分钟</span>
                </div>
                ${data.rating ? `
                    <div class="status-item">
                        <span class="status-label">密钥评分:</span>
                        <span class="status-value">${data.rating}</span>
                    </div>
                ` : ''}
            </div>
        `;
        
        if (data.status === 'running') {
            content += `
                <div class="progress-info">
                    <div class="progress-text">测压进度</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div style="text-align: center; margin-top: 10px; color: #ecf0f1;">
                        已完成 ${progressPercent.toFixed(1)}%
                    </div>
                </div>
            `;
            stopBtn.style.display = 'inline-block';
        } else {
            stopBtn.style.display = 'none';
            
            if (data.rating) {
                const ratingClass = getRatingClass(data.rating);
                content += `
                    <div style="text-align: center; margin-top: 15px;">
                        <div class="rating-badge ${ratingClass}">
                            ${data.rating}
                        </div>
                    </div>
                `;
            }
        }
    }
    
    modalContent.innerHTML = content;
    modal.style.display = 'flex';
}

// 获取状态文本
function getStatusText(status) {
    switch (status) {
        case 'running': return '正在测压';
        case 'completed': return '测压完成';
        case 'stopped': return '已中断';
        default: return '未知状态';
    }
}

// 获取评分样式类
function getRatingClass(rating) {
    if (rating.includes('绝壁超开') || rating.includes('可能是超开')) {
        return 'rating-bad';
    } else if (rating.includes('合格')) {
        return 'rating-good';
    } else if (rating.includes('很强')) {
        return 'rating-excellent';
    } else {
        return 'rating-warning';
    }
}

// 关闭弹窗
function closeModal() {
    document.getElementById('stress-modal').style.display = 'none';
}

// 显示公告
async function showAnnouncement() {
    try {
        const response = await fetch('/api/announcement');
        if (response.ok) {
            const data = await response.json();
            if (data.hasAnnouncement && data.content) {
                const modal = document.getElementById('announcement-modal');
                const content = document.getElementById('announcement-content');
                content.textContent = data.content;
                modal.style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('获取公告失败:', error);
    }
}

// 关闭公告弹窗
function closeAnnouncement() {
    document.getElementById('announcement-modal').style.display = 'none';
}

// 停止压力测试
async function stopStressTest() {
    const apiKey = elements.stressApiKey.value.trim();
    
    if (!apiKey) {
        showAlert('请输入要中断的API密钥', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/stress-test/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey: apiKey
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '中断失败');
        }
        
        const result = await response.json();
        showAlert(result.message, 'success');
        
        // 重新查询状态
        queryStressTest();
        
    } catch (error) {
        console.error('中断失败:', error);
        showAlert('中断失败: ' + error.message, 'error');
    }
}

// 显示提示信息
function showAlert(message, type = 'success') {
    // 移除现有提示
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // 创建新提示
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // 插入到页面顶部
    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);
    
    // 3秒后自动移除
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 3000);
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});


