import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { ErrorResponse } from '../types/auth';

export interface AuthenticatedRequest extends Request {
  isAdmin: boolean;
}

/**
 * 管理员身份验证中间件
 * 检查请求头中的 Authorization: Bearer <ADMIN_TOKEN>
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const errorResponse: ErrorResponse = {
      ok: false,
      code: 'AUTH_FORBIDDEN',
      message: '缺少授权头或格式错误'
    };
    return res.status(401).json(errorResponse);
  }

  const token = authHeader.slice(7); // 移除 'Bearer ' 前缀
  
  if (token !== config.ADMIN_TOKEN) {
    const errorResponse: ErrorResponse = {
      ok: false,
      code: 'AUTH_FORBIDDEN',
      message: '无效的管理员令牌'
    };
    return res.status(403).json(errorResponse);
  }

  req.isAdmin = true;
  next();
}
