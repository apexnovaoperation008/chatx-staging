const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Telegram API 配置
const API_ID = 29393286;
const API_HASH = 'b5888e16f0142310e30ed8523bee765a';

class TelegramPhoneClient {
    constructor() {
        this.client = null;
        this.sessionFile = path.join(__dirname, 'sessions', 'telegram_session.txt');
        this.session = this.loadSession();
        this.currentQRCode = null;
        this.isConnected = false;
        this.userInfo = null;
        this.loginState = 'idle'; // idle, qr, phone, code, password
        this.phoneNumber = null;
        this.phoneCodeHash = null;
        this.passwordHint = null;
        this.passwordResolver = null;
        
        // 创建Express应用
        this.app = express();
        this.setupWebServer();
    }

    // 设置Web服务器
    setupWebServer() {
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // API端点：获取状态
        this.app.get('/api/status', (req, res) => {
            console.log('🔍 API状态请求 - hasQR:', !!this.currentQRCode, 'loginState:', this.loginState);
            res.json({
                qr: this.currentQRCode,
                hasQR: !!this.currentQRCode,
                isConnected: this.isConnected,
                userInfo: this.userInfo,
                loginState: this.loginState,
                phoneNumber: this.phoneNumber,
                passwordHint: this.passwordHint,
                needPassword: this.loginState === 'password'
            });
        });

        // API端点：开始手机号登录
        this.app.post('/api/phone-login', async (req, res) => {
            try {
                const { phoneNumber } = req.body;
                if (!phoneNumber) {
                    return res.status(400).json({ error: '请提供手机号码' });
                }

                console.log(`📱 开始手机号登录: ${phoneNumber}`);
                this.phoneNumber = phoneNumber;
                this.loginState = 'phone';

                const result = await this.client.sendCode({
                    apiId: API_ID,
                    apiHash: API_HASH
                }, phoneNumber);

                this.phoneCodeHash = result.phoneCodeHash;
                this.loginState = 'code';

                console.log('✅ 验证码已发送到手机');
                res.json({ 
                    success: true, 
                    message: '验证码已发送到手机',
                    needCode: true
                });

            } catch (error) {
                console.error('❌ 手机号登录失败:', error.message);
                this.loginState = 'idle';
                res.status(500).json({ error: error.message });
            }
        });

        // API端点：提交验证码
        this.app.post('/api/submit-code', async (req, res) => {
            try {
                const { code } = req.body;
                if (!code) {
                    return res.status(400).json({ error: '请提供验证码' });
                }

                console.log(`🔢 验证码: ${code}`);

                // 使用底层API来验证验证码
                const { Api } = require('telegram');
                const result = await this.client.invoke(new Api.auth.SignIn({
                    phoneNumber: this.phoneNumber,
                    phoneCodeHash: this.phoneCodeHash,
                    phoneCode: code
                }));

                if (result._ === 'auth.authorizationSignUpRequired') {
                    return res.status(400).json({ 
                        error: '需要注册新账户',
                        needSignUp: true 
                    });
                }

                // 登录成功
                console.log('🎉 手机号登录成功！');
                this.loginState = 'idle';
                await this.updateUserInfo();
                this.saveSession();

                res.json({ 
                    success: true, 
                    message: '登录成功',
                    user: this.userInfo
                });

            } catch (error) {
                console.error('❌ 验证码验证失败:', error.message);
                
                if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
                    this.loginState = 'password';
                    res.json({ 
                        success: false, 
                        needPassword: true,
                        message: '需要两步验证密码'
                    });
                } else {
                    this.loginState = 'idle';
                    res.status(500).json({ error: error.message });
                }
            }
        });

        // API端点：提交两步验证密码
        this.app.post('/api/submit-password', async (req, res) => {
            try {
                const { password } = req.body;
                if (!password) {
                    return res.status(400).json({ error: '请提供密码' });
                }

                console.log('🔐 验证两步验证密码...');

                // 如果是QR码登录的2FA，使用resolver
                if (this.passwordResolver) {
                    console.log('🔐 QR码登录2FA - 提交密码');
                    this.passwordResolver(password);
                    this.passwordResolver = null;
                    this.passwordHint = null;
                    
                    res.json({ 
                        success: true, 
                        message: '密码已提交，等待验证...'
                    });
                    return;
                }

                // 手机号登录的2FA
                console.log('🔐 手机号登录2FA - 验证密码');
                
                // 获取密码配置
                const { Api } = require('telegram');
                const passwordSrp = await this.client.invoke(new Api.account.GetPassword());
                
                // 计算SRP
                const { computeCheck } = require('telegram/Password');
                const passwordCheck = await computeCheck(passwordSrp, password);
                
                // 提交密码
                await this.client.invoke(new Api.auth.CheckPassword({
                    password: passwordCheck
                }));

                // 登录成功
                console.log('🎉 两步验证成功！');
                this.loginState = 'idle';
                await this.updateUserInfo();
                this.saveSession();

                res.json({ 
                    success: true, 
                    message: '登录成功',
                    user: this.userInfo
                });

            } catch (error) {
                console.error('❌ 两步验证失败:', error.message);
                res.status(500).json({ error: error.message });
            }
        });

        // API端点：开始QR码登录
        this.app.post('/api/qr-login', async (req, res) => {
            try {
                console.log('📱 开始QR码登录...');
                this.loginState = 'qr';
                // 启动QR码登录但不等待完成
                this.startQRLogin().catch(error => {
                    console.error('❌ QR码登录过程出错:', error.message);
                });
                res.json({ success: true, message: 'QR码登录已开始' });
            } catch (error) {
                console.error('❌ QR码登录失败:', error.message);
                this.loginState = 'idle';
                res.status(500).json({ error: error.message });
            }
        });

        // 主页面
        this.app.get('/', (req, res) => {
            res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram 多方式登录</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 40px;
            text-align: center;
            max-width: 600px;
            width: 100%;
        }

        h1 {
            color: #333;
            margin-bottom: 30px;
            font-size: 2em;
        }

        .login-tabs {
            display: flex;
            margin-bottom: 30px;
            border-radius: 10px;
            overflow: hidden;
            background-color: #f0f0f0;
        }

        .tab {
            flex: 1;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
            border: none;
            background: transparent;
            font-size: 1em;
        }

        .tab.active {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
        }

        .tab-content {
            display: none;
            min-height: 400px;
        }

        .tab-content.active {
            display: block;
        }

        .status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-weight: bold;
            transition: all 0.3s ease;
        }

        .status.waiting {
            background-color: #fff3cd;
            color: #856404;
            border: 2px solid #ffeaa7;
        }

        .status.ready {
            background-color: #d4edda;
            color: #155724;
            border: 2px solid #00b894;
        }

        .status.connected {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 2px solid #74b9ff;
        }

        .status.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 2px solid #dc3545;
        }

        .qr-container {
            border: 3px dashed #ddd;
            border-radius: 15px;
            padding: 30px;
            margin: 20px 0;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f8f9fa;
            transition: all 0.3s ease;
        }

        .qr-container.has-qr {
            border-color: #28a745;
            background-color: #f8fff9;
        }

        .qr-image {
            max-width: 100%;
            max-height: 280px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #333;
        }

        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 1em;
            transition: border-color 0.3s ease;
        }

        input:focus {
            border-color: #667eea;
            outline: none;
        }

        .btn {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1em;
            margin: 5px;
            transition: all 0.3s ease;
            min-width: 120px;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .user-info {
            background-color: #e3f2fd;
            border: 1px solid #90caf9;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            color: #1565c0;
            text-align: left;
        }

        .loading {
            color: #666;
            font-size: 1.1em;
        }

        .info {
            background-color: #e3f2fd;
            border: 1px solid #90caf9;
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            color: #1565c0;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 Telegram 多方式登录</h1>
        
        <div class="login-tabs">
            <button class="tab active" onclick="switchTab('qr')">QR码登录</button>
            <button class="tab" onclick="switchTab('phone')">手机号登录</button>
        </div>

        <div id="status" class="status waiting">
            选择登录方式...
        </div>

        <!-- QR码登录 -->
        <div id="qr-tab" class="tab-content active">
            <div id="qrContainer" class="qr-container">
                <div class="loading">点击下方按钮开始QR码登录</div>
            </div>
            <button class="btn" onclick="startQRLogin()">📱 开始QR码登录</button>
            <div class="info">
                <strong>QR码登录说明：</strong><br>
                1. 点击"开始QR码登录"<br>
                2. 使用Telegram移动端扫描QR码<br>
                3. 在手机上确认登录
            </div>
        </div>

        <!-- 手机号登录 -->
        <div id="phone-tab" class="tab-content">
            <div id="phoneLogin">
                <div class="form-group">
                    <label for="phoneNumber">手机号码：</label>
                    <input type="tel" id="phoneNumber" placeholder="+86 138 0013 8000" />
                </div>
                <button class="btn" onclick="startPhoneLogin()">📞 发送验证码</button>
            </div>

            <div id="codeInput" style="display: none;">
                <div class="form-group">
                    <label for="verificationCode">验证码：</label>
                    <input type="text" id="verificationCode" placeholder="输入收到的验证码" maxlength="5" />
                </div>
                <button class="btn" onclick="submitCode()">✅ 验证</button>
                <button class="btn" onclick="backToPhone()" style="background: #6c757d;">← 返回</button>
            </div>

            <div id="passwordInput" style="display: none;">
                <div class="form-group">
                    <label for="twoFactorPassword">两步验证密码：</label>
                    <input type="password" id="twoFactorPassword" placeholder="输入两步验证密码" />
                </div>
                <button class="btn" onclick="submitPassword()">🔐 验证密码</button>
                <button class="btn" onclick="backToPhone()" style="background: #6c757d;">← 返回</button>
            </div>

            <div class="info">
                <strong>手机号登录说明：</strong><br>
                1. 输入完整的手机号码（包含国家代码）<br>
                2. 点击"发送验证码"<br>
                3. 输入收到的验证码<br>
                4. 如有两步验证，输入密码
            </div>
        </div>

        <!-- 用户信息 -->
        <div id="userInfo" style="display: none;"></div>
    </div>

    <script>
        let checkInterval;
        let currentTab = 'qr';

        function switchTab(tab) {
            // 更新标签状态
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            // 更简单的方式查找并激活标签
            document.querySelectorAll('.tab').forEach(t => {
                if (t.textContent.includes(tab === 'qr' ? 'QR码' : '手机号')) {
                    t.classList.add('active');
                }
            });
            document.getElementById(tab + '-tab').classList.add('active');
            
            currentTab = tab;
            updateStatus('选择登录方式...', 'waiting');
        }

        function updateStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = message;
            statusDiv.className = 'status ' + type;
        }

        async function startQRLogin() {
            try {
                console.log('🔥 startQRLogin函数被调用了！');
                updateStatus('正在启动QR码登录...', 'waiting');
                const response = await fetch('/api/qr-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    updateStatus('QR码生成中...', 'waiting');
                    // 延迟1秒开始状态检查，给QR码生成足够时间
                    setTimeout(() => {
                        startStatusCheck();
                    }, 1000);
                } else {
                    updateStatus('QR码登录启动失败', 'error');
                }
            } catch (error) {
                console.error('❌ startQRLogin错误:', error);
                updateStatus('网络错误', 'error');
            }
        }

        async function startPhoneLogin() {
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            if (!phoneNumber) {
                updateStatus('请输入手机号码', 'error');
                return;
            }

            try {
                updateStatus('正在发送验证码...', 'waiting');
                const response = await fetch('/api/phone-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber })
                });

                const data = await response.json();
                
                if (response.ok && data.success) {
                    updateStatus('验证码已发送到手机', 'ready');
                    document.getElementById('phoneLogin').style.display = 'none';
                    document.getElementById('codeInput').style.display = 'block';
                } else {
                    updateStatus(data.error || '发送验证码失败', 'error');
                }
            } catch (error) {
                updateStatus('网络错误', 'error');
            }
        }

        async function submitCode() {
            const code = document.getElementById('verificationCode').value.trim();
            if (!code) {
                updateStatus('请输入验证码', 'error');
                return;
            }

            try {
                updateStatus('正在验证...', 'waiting');
                const response = await fetch('/api/submit-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();
                
                if (response.ok && data.success) {
                    updateStatus('登录成功！', 'connected');
                    showUserInfo(data.user);
                } else if (data.needPassword) {
                    updateStatus('需要两步验证密码', 'waiting');
                    document.getElementById('codeInput').style.display = 'none';
                    document.getElementById('passwordInput').style.display = 'block';
                } else {
                    updateStatus(data.error || '验证失败', 'error');
                }
            } catch (error) {
                updateStatus('网络错误', 'error');
            }
        }

        async function submitPassword() {
            const password = document.getElementById('twoFactorPassword').value.trim();
            if (!password) {
                updateStatus('请输入两步验证密码', 'error');
                return;
            }

            try {
                updateStatus('正在验证密码...', 'waiting');
                const response = await fetch('/api/submit-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                const data = await response.json();
                
                if (response.ok && data.success) {
                    if (data.user) {
                        updateStatus('登录成功！', 'connected');
                        showUserInfo(data.user);
                    } else {
                        updateStatus(data.message || '密码已提交，等待验证...', 'waiting');
                        // 继续状态检查，等待QR码登录完成
                    }
                } else {
                    updateStatus(data.error || '密码验证失败', 'error');
                }
            } catch (error) {
                updateStatus('网络错误', 'error');
            }
        }

        function backToPhone() {
            document.getElementById('phoneLogin').style.display = 'block';
            document.getElementById('codeInput').style.display = 'none';
            document.getElementById('passwordInput').style.display = 'none';
            updateStatus('选择登录方式...', 'waiting');
        }

        function showUserInfo(userInfo) {
            const userInfoDiv = document.getElementById('userInfo');
            userInfoDiv.innerHTML = 
                '<div class="user-info">' +
                    '<h3>👤 登录成功</h3>' +
                    '<p><strong>姓名：</strong>' + (userInfo.firstName || '') + ' ' + (userInfo.lastName || '') + '</p>' +
                    '<p><strong>用户名：</strong>@' + (userInfo.username || 'N/A') + '</p>' +
                    '<p><strong>电话：</strong>' + (userInfo.phone || 'N/A') + '</p>' +
                    '<p><strong>用户ID：</strong>' + userInfo.id + '</p>' +
                    '<p><strong>验证状态：</strong>' + (userInfo.verified ? '✅ 已验证' : '❌ 未验证') + '</p>' +
                '</div>';
            userInfoDiv.style.display = 'block';
            
            // 隐藏登录表单
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
        }

        async function checkStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                console.log('🔍 状态检查结果:', data);
                
                if (data.isConnected && data.userInfo) {
                    updateStatus('已登录', 'connected');
                    showUserInfo(data.userInfo);
                    if (checkInterval) {
                        clearInterval(checkInterval);
                    }
                } else if (data.needPassword && data.loginState === 'password') {
                    updateStatus('需要两步验证密码' + (data.passwordHint ? ' (提示: ' + data.passwordHint + ')' : ''), 'waiting');
                    document.getElementById('codeInput').style.display = 'none';
                    document.getElementById('passwordInput').style.display = 'block';
                    
                    // 如果是QR码登录，隐藏QR码
                    if (currentTab === 'qr') {
                        const qrContainer = document.getElementById('qrContainer');
                        qrContainer.innerHTML = '<div class="loading">请输入两步验证密码</div>';
                    }
                } else if (currentTab === 'qr' && data.hasQR && data.qr) {
                    updateStatus('请扫描QR码', 'ready');
                    const qrContainer = document.getElementById('qrContainer');
                    qrContainer.className = 'qr-container has-qr';
                    qrContainer.innerHTML = '<img src="' + data.qr + '" alt="Telegram QR Code" class="qr-image">';
                } else if (currentTab === 'qr') {
                    console.log('🔍 QR状态: hasQR=' + data.hasQR + ', qr存在=' + !!data.qr);
                }
            } catch (error) {
                console.error('状态检查失败:', error);
            }
        }

        function startStatusCheck() {
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            checkInterval = setInterval(checkStatus, 2000);
        }

        // 页面加载时检查状态
        document.addEventListener('DOMContentLoaded', function() {
            checkStatus();
        });

        // 清理定时器
        window.addEventListener('beforeunload', function() {
            if (checkInterval) {
                clearInterval(checkInterval);
            }
        });
    </script>
</body>
</html>
            `);
        });
    }

    // 加载保存的会话
    loadSession() {
        try {
            if (fs.existsSync(this.sessionFile)) {
                const sessionString = fs.readFileSync(this.sessionFile, 'utf8');
                console.log('📁 找到已保存的会话文件');
                return new StringSession(sessionString);
            }
        } catch (error) {
            console.log('⚠️  加载会话文件失败:', error.message);
        }
        
        console.log('🆕 创建新的会话');
        return new StringSession('');
    }

    // 保存会话到文件
    saveSession() {
        try {
            const sessionString = this.client.session.save();
            fs.writeFileSync(this.sessionFile, sessionString, 'utf8');
            console.log('💾 会话已保存到:', this.sessionFile);
        } catch (error) {
            console.error('❌ 保存会话失败:', error.message);
        }
    }

    // QR码登录
    async startQRLogin() {
        try {
            this.currentQRCode = null;
            this.loginState = 'qr';

            await this.client.signInUserWithQrCode(
                { apiId: API_ID, apiHash: API_HASH },
                {
                    onError: (err) => {
                        console.error('❌ QR码登录错误:', err.message);
                        console.error('❌ 错误详情:', err);
                        this.loginState = 'idle';
                        this.currentQRCode = null;
                    },
                    qrCode: async (code) => {
                        console.log('📱 QR码已生成');
                        
                        try {
                            const qrCodeDataURL = await qrcode.toDataURL(`tg://login?token=${code.token}`, {
                                width: 256,
                                margin: 2,
                                color: {
                                    dark: '#000000',
                                    light: '#FFFFFF'
                                }
                            });
                            
                            this.currentQRCode = qrCodeDataURL;
                            console.log('✅ QR码已更新到网页');
                            console.log('🔍 QR码长度:', qrCodeDataURL ? qrCodeDataURL.length : 0);
                            console.log('🔍 QR码已保存到 currentQRCode:', !!this.currentQRCode);
                            
                        } catch (error) {
                            console.error('❌ 生成QR码失败:', error.message);
                        }
                    },
                    password: async (hint) => {
                        console.log(`🔐 QR码登录需要两步验证密码 (提示: ${hint || '无提示'})`);
                        this.loginState = 'password';
                        this.passwordHint = hint;
                        
                        // 等待用户通过网页输入密码
                        return new Promise((resolve) => {
                            this.passwordResolver = resolve;
                        });
                    }
                }
            );

            // 登录成功
            console.log('🎉 QR码登录成功！');
            this.currentQRCode = null;
            this.loginState = 'idle';
            this.passwordHint = null;
            this.passwordResolver = null;
            await this.updateUserInfo();
            this.saveSession();

        } catch (error) {
            console.error('❌ QR码登录失败:', error.message);
            this.loginState = 'idle';
        }
    }

    // 更新用户信息
    async updateUserInfo() {
        try {
            this.isConnected = true;
            const me = await this.client.getMe();
            this.userInfo = {
                firstName: me.firstName,
                lastName: me.lastName,
                username: me.username,
                phone: me.phone,
                id: me.id.toString(),
                verified: me.verified
            };
            
            console.log('👤 用户信息:');
            console.log(`   姓名: ${me.firstName || ''} ${me.lastName || ''}`);
            console.log(`   用户名: @${me.username || 'N/A'}`);
            console.log(`   电话: ${me.phone || 'N/A'}`);
            console.log(`   ID: ${me.id}`);
            console.log(`   验证状态: ${me.verified ? '✅ 已验证' : '❌ 未验证'}`);

            // 获取一些对话信息
            const dialogs = await this.client.getDialogs({ limit: 5 });
            console.log(`\n💬 最近对话 (前5个):`);
            dialogs.forEach((dialog, index) => {
                const entity = dialog.entity;
                let name = entity.title || entity.firstName || entity.username || 'Unknown';
                let type = entity.className || 'Unknown';
                console.log(`   ${index + 1}. ${name} (${type})`);
            });

        } catch (error) {
            console.error('❌ 获取用户信息失败:', error.message);
        }
    }

    // 启动服务
    async start() {
        // 启动Web服务器
        const PORT = 3002;
        this.app.listen(PORT, () => {
            console.log(`🌐 多方式登录服务器启动: http://localhost:${PORT}`);
            console.log('📱 支持QR码和手机号两种登录方式');
        });

        // 初始化Telegram客户端
        try {
            console.log('🔐 初始化 Telegram 客户端...');
            
            this.client = new TelegramClient(this.session, API_ID, API_HASH, {
                deviceModel: 'Desktop',
                systemVersion: 'Windows 10',
                appVersion: '1.0.0',
                langCode: 'zh-cn',
                connectionRetries: 5,
            });

            console.log('🔄 正在连接到 Telegram 服务器...');
            await this.client.connect();

            // 检查是否已经登录
            if (await this.client.isUserAuthorized()) {
                console.log('✅ 已经登录！');
                await this.updateUserInfo();
            } else {
                console.log('📱 等待用户选择登录方式...');
            }

        } catch (error) {
            console.error('❌ Telegram 客户端初始化失败:', error.message);
        }
    }

    // 断开连接
    async disconnect() {
        if (this.client) {
            await this.client.destroy();
            console.log('👋 已断开 Telegram 连接');
        }
    }
}

// 主函数
async function main() {
    const client = new TelegramPhoneClient();

    // 处理程序退出
    process.on('SIGINT', async () => {
        console.log('\n\n👋 正在退出...');
        await client.disconnect();
        process.exit(0);
    });

    // 启动
    try {
        await client.start();
    } catch (error) {
        console.error('❌ 程序启动失败:', error.message);
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main().catch(console.error);
}

module.exports = TelegramPhoneClient;
