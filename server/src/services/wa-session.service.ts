/**
 * WhatsApp 会话管理服务
 * 实现严格的状态机和生命周期管理
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { create, Client } from '@open-wa/wa-automate';
import { SessionState, SessionInfo, QRData, QR_CONFIG, isValidStateTransition } from '../types/session.types';

export class WaSession {
  public readonly id: string;
  private _state: SessionState = 'INIT';
  private _qr?: QRData;
  private _client?: Client;
  private _qrTimer?: NodeJS.Timeout;
  private _timeoutTimer?: NodeJS.Timeout;
  private _sessionDir: string;
  private _retryCount = 0;
  private _createdAt: number;
  private _connectedAt?: number;
  private _lastActivity: number;

  constructor(instanceId?: string) {
    this.id = instanceId || `wa-${uuidv4()}`;
    this._sessionDir = path.join(process.env.WA_DATA_ROOT || './.wa-sessions', this.id);
    this._createdAt = Date.now();
    this._lastActivity = Date.now();
    
    console.log(`🆕 创建WhatsApp会话实例: ${this.id}`);
  }

  /**
   * 获取当前状态
   */
  get state(): SessionState {
    return this._state;
  }

  /**
   * 获取QR码数据
   */
  get qr(): QRData | undefined {
    // 检查QR是否过期
    if (this._qr && Date.now() > this._qr.expiresAt) {
      console.log(`⏰ QR码已过期: ${this.id}`);
      this._qr = undefined;
      if (this._state === 'QR_READY') {
        this._refreshQR();
      }
    }
    return this._qr;
  }

  /**
   * 获取会话信息
   */
  get info(): SessionInfo {
    return {
      id: this.id,
      state: this._state,
      qr: this.qr,
      createdAt: this._createdAt,
      connectedAt: this._connectedAt,
      lastActivity: this._lastActivity
    };
  }

  /**
   * 状态转换
   */
  private _setState(newState: SessionState, reason?: string): void {
    const oldState = this._state;
    
    if (!isValidStateTransition(oldState, newState)) {
      console.error(`❌ 非法状态转换: ${oldState} -> ${newState} (${this.id})`);
      return;
    }

    this._state = newState;
    this._lastActivity = Date.now();
    
    console.log(`🔄 状态转换: ${oldState} -> ${newState} (${this.id}) ${reason ? `- ${reason}` : ''}`);
    
    // 状态转换后的清理和设置
    this._onStateChanged(newState, oldState);
  }

  /**
   * 状态变更处理
   */
  private _onStateChanged(newState: SessionState, oldState: SessionState): void {
    switch (newState) {
      case 'QR_READY':
        this._startQRRefreshTimer();
        this._startTimeoutTimer();
        break;
        
      case 'AUTHENTICATING':
        // 停止QR刷新，但保持超时监控
        this._clearQRTimer();
        break;
        
      case 'CONNECTED':
        this._connectedAt = Date.now();
        this._clearAllTimers();
        this._clearQR();
        console.log(`✅ WhatsApp会话已连接: ${this.id}`);
        break;
        
      case 'FAILED':
      case 'DISCONNECTED':
        this._clearAllTimers();
        this._clearQR();
        break;
    }
  }

  /**
   * 启动会话
   */
  async start(): Promise<void> {
    if (this._state !== 'INIT') {
      throw new Error(`会话已启动: ${this.id} (${this._state})`);
    }

    try {
      console.log(`🚀 启动WhatsApp会话: ${this.id}`);
      
      this._client = await create({
        sessionId: this.id,
        multiDevice: true,
        headless: true,
        dataDir: this._sessionDir,
        qrTimeout: 0,
        authTimeout: 0,
        qrLogSkip: true,
        disableSpins: true,
        killProcessOnBrowserClose: false,
        // 使用Puppeteer自动寻找Chrome路径，更可靠
        useChrome: true,
        // 让Puppeteer自动管理浏览器，避免路径问题
        autoRefresh: true,
        chromiumArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
        qrRefreshS: 60, // 60秒刷新QR
      });

      // 绑定事件
      this._bindEvents();
      
    } catch (error) {
      console.error(`❌ 启动WhatsApp会话失败: ${this.id}`, error);
      this._setState('FAILED', `启动失败: ${error}`);
      throw error;
    }
  }

  /**
   * 绑定open-wa事件
   */
  private _bindEvents(): void {
    if (!this._client) return;

    // QR码生成事件
    // @ts-ignore - onQr property may not exist in type definition
    this._client.onQr = (base64Qr: string) => {
      this._onQRGenerated(base64Qr);
    };

    // 状态变化事件
    this._client.onStateChanged((state) => {
      console.log(`📱 客户端状态变化: ${state} (${this.id})`);
      
      if (state === 'OPENING' || state === 'PAIRING') {
        this._setState('AUTHENTICATING', `客户端状态: ${state}`);
      } else if (state === 'CONNECTED') {
        this._setState('CONNECTED', '客户端已连接');
      }
    });

    // 连接事件
    // @ts-ignore - onLoggedIn property may not exist in type definition
    this._client.onLoggedIn(() => {
      this._setState('CONNECTED', '登录成功');
    });

    // 断连事件
    this._client.onLogout(() => {
      this._setState('DISCONNECTED', '用户登出');
    });

    // 全局QR事件兜底
    const { ev } = require('@open-wa/wa-automate');
    ev.on(`qr.${this.id}`, (qrData: string) => {
      this._onQRGenerated(qrData);
    });
  }

  /**
   * QR码生成处理
   */
  private _onQRGenerated(base64Qr: string): void {
    if (this._state === 'CONNECTED') {
      console.log(`⚠️ 已连接状态下收到QR码，忽略: ${this.id}`);
      return;
    }

    const dataUrl = `data:image/png;base64,${base64Qr}`;
    this._qr = {
      data: dataUrl,
      expiresAt: Date.now() + QR_CONFIG.EXPIRY_TIME,
      generatedAt: Date.now()
    };

    console.log(`📱 QR码已生成: ${this.id}, 过期时间: ${new Date(this._qr.expiresAt).toLocaleTimeString()}`);
    
    if (this._state === 'INIT') {
      this._setState('QR_READY', 'QR码生成完成');
    }
  }

  /**
   * 启动QR刷新定时器
   */
  private _startQRRefreshTimer(): void {
    this._clearQRTimer();
    
    this._qrTimer = setInterval(() => {
      if (this._state === 'QR_READY' && this._client) {
        console.log(`🔄 刷新QR码: ${this.id}`);
        // open-wa会自动刷新QR，我们只需要等待事件
      }
    }, QR_CONFIG.REFRESH_INTERVAL);
  }

  /**
   * 启动超时定时器
   */
  private _startTimeoutTimer(): void {
    this._clearTimeoutTimer();
    
    this._timeoutTimer = setTimeout(() => {
      if (this._state === 'QR_READY' || this._state === 'AUTHENTICATING') {
        this._setState('FAILED', `登录超时 (${QR_CONFIG.TIMEOUT_MINUTES}分钟)`);
      }
    }, QR_CONFIG.TIMEOUT_MINUTES * 60 * 1000);
  }

  /**
   * 清理QR相关资源
   */
  private _clearQR(): void {
    this._qr = undefined;
    this._clearQRTimer();
  }

  /**
   * 清理QR定时器
   */
  private _clearQRTimer(): void {
    if (this._qrTimer) {
      clearInterval(this._qrTimer);
      this._qrTimer = undefined;
    }
  }

  /**
   * 清理超时定时器
   */
  private _clearTimeoutTimer(): void {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = undefined;
    }
  }

  /**
   * 清理所有定时器
   */
  private _clearAllTimers(): void {
    this._clearQRTimer();
    this._clearTimeoutTimer();
  }

  /**
   * 手动刷新QR
   */
  private _refreshQR(): void {
    if (this._retryCount >= QR_CONFIG.MAX_RETRY_COUNT) {
      this._setState('FAILED', '超过最大重试次数');
      return;
    }

    this._retryCount++;
    console.log(`🔄 手动刷新QR码: ${this.id} (第${this._retryCount}次)`);
    // open-wa会自动处理QR刷新
  }

  /**
   * 重试会话（从FAILED状态回到INIT）
   */
  async retry(): Promise<void> {
    if (this._state !== 'FAILED') {
      throw new Error(`当前状态不允许重试: ${this._state}`);
    }

    this._retryCount = 0;
    this._clearAllTimers();
    this._clearQR();
    
    // 如果有现有客户端，先清理
    if (this._client) {
      try {
        await this._client.kill();
      } catch (error) {
        console.error('清理旧客户端时出错:', error);
      }
      this._client = undefined;
    }
    
    this._setState('INIT', '手动重试');
    console.log(`🔄 会话已重置到INIT状态: ${this.id}`);
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    console.log(`🔌 断开WhatsApp会话: ${this.id}`);
    
    this._clearAllTimers();
    this._clearQR();
    
    if (this._client) {
      try {
        await this._client.logout();
      } catch (error) {
        console.error(`断开连接时出错: ${this.id}`, error);
      }
    }
    
    this._setState('DISCONNECTED', '手动断开');
  }

  /**
   * 销毁会话
   */
  async destroy(): Promise<void> {
    console.log(`💥 销毁WhatsApp会话: ${this.id}`);
    
    await this.disconnect();
    
    if (this._client) {
      try {
        await this._client.kill();
      } catch (error) {
        console.error(`销毁客户端时出错: ${this.id}`, error);
      }
      this._client = undefined;
    }
  }
}
