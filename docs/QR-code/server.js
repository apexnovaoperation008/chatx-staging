const express = require('express');
const cors = require('cors');
const { create, Client, ev } = require('@open-wa/wa-automate');
const path = require('path');

const app = express();
const PORT = 3000;

// 存储QR码的变量
let currentQRCode = null;
let waClient = null;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API端点：获取QR码
app.get('/api/qr', (req, res) => {
    if (currentQRCode) {
        res.json({ qr: currentQRCode, hasQR: true });
    } else {
        res.json({ hasQR: false });
    }
});

// API端点：获取连接状态
app.get('/api/status', (req, res) => {
    res.json({ 
        connected: waClient ? true : false,
        hasQR: currentQRCode ? true : false
    });
});

// API端点：更新QR码
app.post('/api/qr/update', (req, res) => {
    const { qr } = req.body;
    
    if (!qr) {
        return res.status(400).json({ error: '请提供QR码数据' });
    }
    
    currentQRCode = qr;
    console.log('QR码已通过API更新，长度:', qr.length);
    
    res.json({ 
        success: true, 
        message: 'QR码更新成功',
        qrLength: qr.length 
    });
});

// API端点：手动设置QR码（用于测试）
app.get('/api/qr/set-test', (req, res) => {
    // 这里可以设置一个测试QR码
    currentQRCode = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABZ0RVh0Q3JlYXRpb24gVGltZQAwNy8yNC8yNKlwgg8AAAAddEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIFRoZSBHSU1Q72QlbgAAIABJREFUeJzs3XeYXGd1x/Hv2zuzs9tXvS3Z6r1ZvWPJlovc5YIxGGMwJpAQSAIkJCGkEQIESCeUAAm9Q+gQ6qGDcZF7kS3Jkq3eV9pu7+3Nzr7vH3dmdndm2s7sztbdOZ/nmWdm3nvffe+dOe85733f+15RVYYYYooGXKsFGGKI2fOGCGCIISbJDAEAAAl/SURBVBYZIoAhhpgkQwQwxBCTZIgAhhgik8z0AAAASUVORK5CYII=";
    console.log('测试QR码已设置');
    res.json({ 
        success: true, 
        message: '测试QR码已设置' 
    });
});

// 启动WhatsApp客户端
async function startWhatsApp() {
    try {
        console.log('正在启动WhatsApp客户端...');
        
        // 使用create函数，它会返回客户端实例
        const client = await create({
            sessionId: 'wa-session',
            multiDevice: true,
            authTimeout: 60,
            blockCrashLogs: true,
            disableSpins: true,
            headless: true,
            hostNotificationLang: 'PT_BR',
            logConsole: false,
            popup: true,
            qrTimeout: 0,
            qrRefreshS: 15,
        });

        waClient = client;
        console.log('WhatsApp客户端启动成功!');
        
        // 监听消息（可选，用于测试）
        waClient.onMessage(async message => {
            console.log('收到消息:', message.body);
        });

        // 监听断开连接
        waClient.onStateChanged(state => {
            console.log('连接状态改变:', state);
            if (state === 'CONFLICT' || state === 'DISCONNECTED') {
                currentQRCode = null;
                waClient = null;
            } else if (state === 'CONNECTED') {
                // 连接成功后保持QR码显示一段时间，然后清除
                console.log('WhatsApp连接成功！');
                setTimeout(() => {
                    currentQRCode = null;
                    console.log('连接成功，QR码已清除');
                }, 5000); // 5秒后清除
            }
        });

    } catch (error) {
        console.error('启动WhatsApp客户端时发生错误:', error);
        setTimeout(startWhatsApp, 5000); // 5秒后重试
    }
}



// QR码事件监听
if (ev) {
    ev.on('qr.**', (qrcode, sessionId) => {
        console.log('QR码事件触发, sessionId:', sessionId);
        console.log('QR码长度:', qrcode ? qrcode.length : 'null');
        if (qrcode) {
            // 处理QR码数据
            if (qrcode.startsWith('data:image/png;base64,')) {
                currentQRCode = qrcode.replace('data:image/png;base64,', '');
                console.log('QR码已更新(data URL), base64长度:', currentQRCode.length);
            } else {
                currentQRCode = qrcode;
                console.log('QR码已更新(base64), 长度:', currentQRCode.length);
            }
        }
    });
}

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('正在初始化WhatsApp客户端...');
    
    // 启动WhatsApp客户端
    startWhatsApp();
});

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('正在关闭服务器...');
    if (waClient) {
        await waClient.kill();
    }
    process.exit(0);
});
