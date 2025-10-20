/**
 * WhatsApp 会话状态管理类型定义
 * 实现单向状态流转和严格的状态约束
 */

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

/**
 * 状态转换规则
 * 定义允许的状态迁移路径
 */
export const STATE_TRANSITIONS: Record<SessionState, SessionState[]> = {
  INIT: ['QR_READY', 'FAILED'],
  QR_READY: ['AUTHENTICATING', 'FAILED', 'DISCONNECTED'],
  AUTHENTICATING: ['CONNECTED', 'FAILED', 'DISCONNECTED'],
  CONNECTED: ['DISCONNECTED'],
  FAILED: ['QR_READY', 'DISCONNECTED'], // 允许重试
  DISCONNECTED: ['QR_READY', 'FAILED']  // 允许重连
};

/**
 * 验证状态转换是否合法
 */
export function isValidStateTransition(from: SessionState, to: SessionState): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}

/**
 * QR码配置
 */
export const QR_CONFIG = {
  EXPIRY_TIME: 90 * 1000,      // 90秒过期
  REFRESH_INTERVAL: 60 * 1000, // 60秒刷新
  MAX_RETRY_COUNT: 3,          // 最大重试次数
  TIMEOUT_MINUTES: 5           // 5分钟超时转为FAILED
} as const;
