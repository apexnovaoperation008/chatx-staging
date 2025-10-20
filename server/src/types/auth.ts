// 统一登录状态机
export type LoginStatus =
  | "INIT"           // 初始化
  | "QR_WAITING"     // 等待扫码
  | "QR_SCANNED"     // 已扫描（等待确认/授权）
  | "CODE_SENT"      // 已发送验证码（手机号流）
  | "VERIFYING"      // 正在验证
  | "READY"          // 已连接/会话就绪
  | "TIMEOUT"        // 超时
  | "CANCELLED"      // 用户取消/主动终止
  | "ERROR";         // 失败

// 统一错误码
export type ErrorCode =
  | "TG_CODE_INVALID"
  | "TG_2FA_REQUIRED"
  | "TG_QR_TIMEOUT"
  | "WA_QR_TIMEOUT"
  | "AUTH_FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_REQUEST"
  | "SESSION_NOT_FOUND";

// API 响应基础类型
export interface BaseResponse {
  ok: boolean;
}

export interface SuccessResponse extends BaseResponse {
  ok: true;
}

export interface ErrorResponse extends BaseResponse {
  ok: false;
  code: ErrorCode;
  message: string;
}

// WhatsApp 接口类型
export interface WAQRResponse extends SuccessResponse {
  dataUrl: string;
}

export interface WAPendingResponse extends BaseResponse {
  pending: true;
}

export interface WAStatusResponse extends SuccessResponse {
  status: LoginStatus;
}

// Telegram 接口类型
export interface TGQRStartResponse extends SuccessResponse {
  loginKey: string;
  qrPayload: string;
}

export interface TGQRPollResponse extends SuccessResponse {
  // 成功时无额外字段，会话已保存到后端
}

export interface TGPendingResponse extends BaseResponse {
  pending: true;
}

export interface TGPhoneStartResponse extends SuccessResponse {
  txId: string;
}

export interface TGPhoneVerifyRequest {
  txId: string;
  code: string;
  password?: string;
}

export interface TGPhoneVerifyResponse extends SuccessResponse {
  // 成功时无额外字段，会话已保存到后端
}

// 会话存储类型
export interface SessionRecord {
  id: string;
  provider: 'telegram' | 'whatsapp';
  sessionId: string;  // WA sessionId 或 TG loginKey
  data: string;       // 加密的会话数据
  createdAt: string;
  updatedAt: string;
}

// 审计日志类型
export interface AuditRecord {
  id: string;
  action: 'LOGIN_START' | 'LOGIN_SUCCESS' | 'LOGIN_ERROR' | 'SESSION_REVOKE';
  provider: 'telegram' | 'whatsapp';
  sessionId: string;
  details?: string;
  timestamp: string;
}
