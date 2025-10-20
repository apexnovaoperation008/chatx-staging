/**
 * WhatsApp 会话管理器
 * 管理多个会话实例，确保实例间的隔离和协调
 */

import { WaSession } from './wa-session.service';
import { SessionState, SessionInfo } from '../types/session.types';
import { WhatsAppSessionsStore } from '../stores/whatsapp-sessions.store';

export class WaSessionManager {
  private static _instance: WaSessionManager;
  private _sessions = new Map<string, WaSession>();

  private constructor() {
    console.log('🎛️ WhatsApp会话管理器已初始化');
  }

  /**
   * 单例模式
   */
  static getInstance(): WaSessionManager {
    if (!WaSessionManager._instance) {
      WaSessionManager._instance = new WaSessionManager();
    }
    return WaSessionManager._instance;
  }

  /**
   * 获取所有会话信息
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this._sessions.values()).map(session => session.info);
  }

  /**
   * 获取特定状态的会话
   */
  getSessionsByState(state: SessionState): SessionInfo[] {
    return this.getAllSessions().filter(session => session.state === state);
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): WaSession | undefined {
    return this._sessions.get(sessionId);
  }

  /**
   * 创建新会话
   */
  async createSession(instanceId?: string): Promise<WaSession> {
    // 检查是否已有相同ID的会话
    if (instanceId && this._sessions.has(instanceId)) {
      throw new Error(`会话ID已存在: ${instanceId}`);
    }

    // 检查是否有正在认证中的会话（避免并行混淆）
    const authenticatingSession = this.getSessionsByState('AUTHENTICATING');
    if (authenticatingSession.length > 0) {
      throw new Error('当前有会话正在认证中，请等待完成后再添加新账号');
    }

    const session = new WaSession(instanceId);
    this._sessions.set(session.id, session);
    
    console.log(`📁 已创建会话: ${session.id}`);
    return session;
  }

  /**
   * 启动会话
   */
  async startSession(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    await session.start();
  }

  /**
   * 获取会话QR码
   */
  getSessionQR(sessionId: string): string | null {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 只有QR_READY状态才返回QR码
    if (session.state !== 'QR_READY') {
      return null;
    }

    const qr = session.qr;
    return qr ? qr.data : null;
  }

  /**
   * 删除会话
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    await session.destroy();
    this._sessions.delete(sessionId);
    
    console.log(`🗑️ 已删除会话: ${sessionId}`);
  }

  /**
   * 重试会话（FAILED -> INIT）
   */
  async retrySession(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    await session.retry();
  }

  /**
   * 将已连接的会话转为正式账号
   */
  async finalizeSession(sessionId: string): Promise<string> {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    if (session.state !== 'CONNECTED') {
      throw new Error(`会话未连接，无法添加为正式账号: ${session.state}`);
    }

    // 保存到WhatsApp专用存储
    const accountId = `account-${sessionId}`;
    WhatsAppSessionsStore.add({
      id: accountId,
      provider: 'whatsapp',
      label: `WhatsApp ${sessionId.slice(-6)}`,
      data: {
        sessionId: sessionId,
        dataDir: `.wa-sessions/${sessionId}`
      },
      createdAt: Date.now()
    });

    console.log(`✅ 会话已转为正式账号: ${sessionId} -> ${accountId}`);
    return accountId;
  }

  /**
   * 断开会话
   */
  async disconnectSession(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    await session.disconnect();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const allSessions = this.getAllSessions();
    const connectedSessions = allSessions.filter(s => s.state === 'CONNECTED');
    
    return {
      total: allSessions.length,
      connected: connectedSessions.length,
      byState: {
        INIT: allSessions.filter(s => s.state === 'INIT').length,
        QR_READY: allSessions.filter(s => s.state === 'QR_READY').length,
        AUTHENTICATING: allSessions.filter(s => s.state === 'AUTHENTICATING').length,
        CONNECTED: connectedSessions.length,
        FAILED: allSessions.filter(s => s.state === 'FAILED').length,
        DISCONNECTED: allSessions.filter(s => s.state === 'DISCONNECTED').length,
      }
    };
  }

  /**
   * 检查是否可以添加新账号
   */
  canAddNewAccount(): { allowed: boolean; reason?: string } {
    const stats = this.getStats();
    
    // 检查是否有正在认证的会话
    if (stats.byState.AUTHENTICATING > 0) {
      return {
        allowed: false,
        reason: '有账号正在认证中，请等待完成'
      };
    }

    // 检查是否有正在等待扫码的会话
    if (stats.byState.QR_READY > 0) {
      return {
        allowed: false,
        reason: '有账号正在等待扫码，请先完成或取消'
      };
    }

    return { allowed: true };
  }

  /**
   * 清理无效会话（注意：自动清理已禁用）
   *
   * 注意：自动清理功能已禁用，因为它会导致正在使用的会话被错误删除。
   * 建议使用手动清理或通过账号管理界面删除不需要的账号。
   */
  async cleanup(): Promise<void> {
    console.log('🧹 会话清理功能已禁用 - 请使用手动清理或账号管理删除不需要的账号');

    // 如果需要清理特定会话，请使用：
    // - manualCleanupSession(sessionId) 函数
    // - POST /wa/cleanup/:sessionId API 端点
    // - /account-management 路由删除账号
  }
}

// 导出单例实例
export const waSessionManager = WaSessionManager.getInstance();
