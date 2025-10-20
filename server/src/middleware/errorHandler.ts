import { Request, Response, NextFunction } from 'express';
import { ErrorResponse, ErrorCode } from '../types/auth';

/**
 * 统一错误处理中间件
 */
export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('❌ API Error:', error);

  // 如果响应已经发送，跳过
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = 500;
  let errorCode: ErrorCode = 'INTERNAL_ERROR';
  let message = '服务器内部错误';

  // 根据错误类型设置状态码和错误信息
  if (error.name === 'ValidationError' || error.name === 'ZodError') {
    statusCode = 400;
    errorCode = 'INVALID_REQUEST';
    message = '请求参数验证失败';
  } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
    statusCode = 503;
    errorCode = 'INTERNAL_ERROR';
    message = '外部服务连接失败';
  } else if (error.code) {
    // 如果错误对象已经包含错误码，直接使用
    errorCode = error.code;
    message = error.message || message;
    statusCode = getStatusCodeForError(errorCode);
  }

  const errorResponse: ErrorResponse = {
    ok: false,
    code: errorCode,
    message
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * 根据错误码获取HTTP状态码
 */
function getStatusCodeForError(errorCode: ErrorCode): number {
  switch (errorCode) {
    case 'AUTH_FORBIDDEN':
      return 403;
    case 'INVALID_REQUEST':
      return 400;
    case 'SESSION_NOT_FOUND':
      return 404;
    case 'TG_CODE_INVALID':
    case 'TG_2FA_REQUIRED':
      return 400;
    case 'TG_QR_TIMEOUT':
    case 'WA_QR_TIMEOUT':
      return 408;
    case 'INTERNAL_ERROR':
    default:
      return 500;
  }
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response) {
  const errorResponse: ErrorResponse = {
    ok: false,
    code: 'INVALID_REQUEST',
    message: `API 路径不存在: ${req.method} ${req.path}`
  };
  res.status(404).json(errorResponse);
}
