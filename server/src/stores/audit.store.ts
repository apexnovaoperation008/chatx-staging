import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/env';
import { AuditRecord } from '../types/auth';

export class AuditStore {
  private logPath: string;

  constructor() {
    this.logPath = config.AUDIT_LOG_PATH;
    
    // 确保日志目录存在
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 记录审计日志
   */
  log(
    action: AuditRecord['action'],
    provider: 'telegram' | 'whatsapp',
    sessionId: string,
    details?: string
  ): void {
    const record: AuditRecord = {
      id: this.generateId(),
      action,
      provider,
      sessionId,
      details,
      timestamp: new Date().toISOString()
    };

    const logLine = JSON.stringify(record) + '\n';
    
    try {
      fs.appendFileSync(this.logPath, logLine, 'utf8');
      console.log(`📝 审计日志: ${action} - ${provider}/${sessionId}`);
    } catch (error) {
      console.error('❌ 写入审计日志失败:', error);
    }
  }

  /**
   * 读取最近的审计日志
   */
  getRecentLogs(limit: number = 100): AuditRecord[] {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const records: AuditRecord[] = [];
      
      // 从后往前读取，获取最新的记录
      for (let i = lines.length - 1; i >= 0 && records.length < limit; i--) {
        try {
          const record = JSON.parse(lines[i]) as AuditRecord;
          records.push(record);
        } catch (parseError) {
          console.error('❌ 解析审计日志行失败:', lines[i], parseError);
        }
      }

      return records;
    } catch (error) {
      console.error('❌ 读取审计日志失败:', error);
      return [];
    }
  }

  /**
   * 按条件查询审计日志
   */
  queryLogs(
    provider?: 'telegram' | 'whatsapp',
    sessionId?: string,
    action?: AuditRecord['action'],
    limit: number = 100
  ): AuditRecord[] {
    const allLogs = this.getRecentLogs(1000); // 先读取更多数据用于筛选
    
    let filteredLogs = allLogs;

    if (provider) {
      filteredLogs = filteredLogs.filter(log => log.provider === provider);
    }

    if (sessionId) {
      filteredLogs = filteredLogs.filter(log => log.sessionId === sessionId);
    }

    if (action) {
      filteredLogs = filteredLogs.filter(log => log.action === action);
    }

    return filteredLogs.slice(0, limit);
  }

  /**
   * 清理旧的审计日志（保留最近N天）
   */
  cleanOldLogs(daysToKeep: number = 30): void {
    try {
      if (!fs.existsSync(this.logPath)) {
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const validLines: string[] = [];
      let removedCount = 0;

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as AuditRecord;
          const recordDate = new Date(record.timestamp);
          
          if (recordDate >= cutoffDate) {
            validLines.push(line);
          } else {
            removedCount++;
          }
        } catch (parseError) {
          // 保留无法解析的行，避免数据丢失
          validLines.push(line);
        }
      }

      if (removedCount > 0) {
        const newContent = validLines.join('\n') + (validLines.length > 0 ? '\n' : '');
        fs.writeFileSync(this.logPath, newContent, 'utf8');
        console.log(`🧹 审计日志清理完成，删除了 ${removedCount} 条旧记录`);
      }
    } catch (error) {
      console.error('❌ 清理审计日志失败:', error);
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 单例实例
export const auditStore = new AuditStore();
