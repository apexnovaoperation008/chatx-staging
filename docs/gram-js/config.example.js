// Telegram API 配置示例
// 复制此文件为 config.js 并填入你的实际值

module.exports = {
    // 从 https://my.telegram.org 获取
    API_ID: 123456,  // 替换为你的 API ID (数字)
    API_HASH: 'your_api_hash_here',  // 替换为你的 API Hash (字符串)
    
    // 可选配置
    DEVICE_MODEL: 'Desktop',
    SYSTEM_VERSION: 'Windows 10',
    APP_VERSION: '1.0.0',
    LANG_CODE: 'zh-cn',
    
    // 会话文件配置
    SESSION_FILE: './sessions/telegram_session.txt',
    
    // 连接配置
    CONNECTION_RETRIES: 5,
    FLOOD_SLEEP_THRESHOLD: 60,
};
