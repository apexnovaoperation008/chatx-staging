/**
 * WhatsApp 会话管理前端API客户端
 * 与状态机驱动的后端API通信
 */

import { api } from './api';

export type SessionState = 
  | 'INIT'           // 实例创建，未生成 QR
  | 'QR_READY'       // 已生成 QR，轮询/推送给前端
  | 'AUTHENTICATING' // 扫码中（收到扫码事件但未完全授权）
  | 'CONNECTED'      // 鉴权完成；必须停止 QR 推送/轮询
  | 'FAILED'         // 鉴权失败/超时；允许重新生成 QR
  | 'DISCONNECTED';  // 曾连接，现断开；可触发重连或销毁

export interface QRData {
  data: string;
  expiresAt: number;
  generatedAt: number;
}

export interface SessionInfo {
  id: string;
  state: SessionState;
  qr?: QRData;
  createdAt: number;
  connectedAt?: number;
  lastActivity: number;
  metadata?: {
    phoneNumber?: string;
    displayName?: string;
    contacts?: number;
    chats?: number;
  };
}

export interface SessionStats {
  total: number;
  connected: number;
  byState: {
    INIT: number;
    QR_READY: number;
    AUTHENTICATING: number;
    CONNECTED: number;
    FAILED: number;
    DISCONNECTED: number;
  };
}

export interface SessionsResponse {
  sessions: SessionInfo[];
  stats: SessionStats;
}

/**
 * WhatsApp 会话管理API客户端
 */
export const WaSessionApi = {
  /**
   * 获取所有会话列表
   */
  async getSessions(): Promise<SessionsResponse> {
    const response = await api('/wa/sessions');
    return response.data || { sessions: [], stats: { total: 0, connected: 0, byState: { INIT: 0, QR_READY: 0, AUTHENTICATING: 0, CONNECTED: 0, FAILED: 0, DISCONNECTED: 0 } } };
  },

  /**
   * 创建新会话（仅分配instanceId，不生成QR）
   */
  async createSession(): Promise<{ instanceId: string; state: SessionState }> {
    const response = await api('/wa/sessions', {
      method: 'POST'
    });
    return response.data;
  },

  /**
   * 按需生成QR码
   */
  async generateQR(sessionId: string): Promise<{ instanceId: string; state: SessionState }> {
    const response = await api(`/wa/sessions/${sessionId}/generate-qr`, {
      method: 'POST'
    });
    return response.data;
  },

  /**
   * 获取特定会话信息
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await api(`/wa/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * 获取会话QR码
   */
  async getSessionQR(sessionId: string): Promise<{ qrData: string; expiresAt: number; state: SessionState } | null> {
    try {
      const response = await api(`/wa/sessions/${sessionId}/qr`);
      return response.data;
    } catch (error: any) {
      // QR不可用时返回null而不是抛出错误
      if (error.message?.includes('QR_NOT_READY') || error.message?.includes('QR_NOT_AVAILABLE')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * 重试会话（FAILED -> INIT）
   */
  async retrySession(sessionId: string): Promise<{ instanceId: string; state: SessionState }> {
    const response = await api(`/wa/sessions/${sessionId}/retry`, {
      method: 'POST'
    });
    return response.data;
  },

  /**
   * 将已连接的会话转为正式账号
   */
  async finalizeSession(sessionId: string): Promise<{ accountId: string; instanceId: string }> {
    const response = await api(`/wa/sessions/${sessionId}/finalize`, {
      method: 'POST'
    });
    return response.data;
  },

  /**
   * 断开会话连接
   */
  async disconnectSession(sessionId: string): Promise<{ instanceId: string; state: SessionState }> {
    const response = await api(`/wa/sessions/${sessionId}/disconnect`, {
      method: 'POST'
    });
    return response.data;
  },

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await api(`/wa/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      return true;
    } catch (error) {
      console.error('删除会话失败:', error);
      return false;
    }
  },

  /**
   * 获取会话统计信息
   */
  async getStats(): Promise<SessionStats> {
    const response = await api('/wa/sessions/stats');
    return response.data || { total: 0, connected: 0, byState: { INIT: 0, QR_READY: 0, AUTHENTICATING: 0, CONNECTED: 0, FAILED: 0, DISCONNECTED: 0 } };
  },

  /**
   * 清理无效会话
   */
  async cleanup(): Promise<boolean> {
    try {
      await api('/wa/sessions/cleanup', {
        method: 'POST'
      });
      return true;
    } catch (error) {
      console.error('清理会话失败:', error);
      return false;
    }
  }
};

/**
 * 状态显示文本映射
 */
export const STATE_DISPLAY_TEXT = {
  INIT: { zh: '初始化中', en: 'Initializing' },
  QR_READY: { zh: '等待扫码', en: 'Awaiting QR Scan' },
  AUTHENTICATING: { zh: '认证中', en: 'Authenticating' },
  CONNECTED: { zh: '已连接', en: 'Connected' },
  FAILED: { zh: '连接失败', en: 'Failed' },
  DISCONNECTED: { zh: '已断开', en: 'Disconnected' }
} as const;

/**
 * 获取状态显示文本
 */
export function getStateDisplayText(state: SessionState, language: 'zh' | 'en' = 'zh'): string {
  return STATE_DISPLAY_TEXT[state][language];
}

/**
 * 检查状态是否允许操作
 */
export const STATE_PERMISSIONS = {
  canDelete: (state: SessionState) => ['FAILED', 'DISCONNECTED', 'CONNECTED'].includes(state),
  canGenerateQR: (state: SessionState) => ['INIT', 'FAILED'].includes(state),
  canRetry: (state: SessionState) => state === 'FAILED',
  canFinalize: (state: SessionState) => state === 'CONNECTED',
  canDisconnect: (state: SessionState) => state === 'CONNECTED',
  canShowQR: (state: SessionState) => state === 'QR_READY',
  isActive: (state: SessionState) => !['FAILED', 'DISCONNECTED'].includes(state),
  isConnected: (state: SessionState) => state === 'CONNECTED'
} as const;
