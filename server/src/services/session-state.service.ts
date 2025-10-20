/**
 * 会话状态管理服务
 * 管理WhatsApp和Telegram账号的活跃状态
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// 创建会话状态变化事件发射器
class SessionStatusEventEmitter extends EventEmitter {}
export const sessionStatusListenerService = new SessionStatusEventEmitter();

export interface SessionData {
  id: string;
  provider: 'whatsapp' | 'telegram';
  label: string;
  description?: string;
  data: {
    sessionId?: string;
    dataDir?: string;
    phoneNumber?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    isActive: boolean;
  };
  createdAt: number;
}

export class SessionStateService {
  private sessionsData: SessionData[] = [];
  private sessionsFilePath: string;
  private dataSessionsFilePath: string;

  constructor() {
    this.sessionsFilePath = path.join(process.cwd(), 'sessions', 'sessions.json');
    this.dataSessionsFilePath = path.join(process.cwd(), 'data', 'sessions.json');
    
    // console.log(`🔍 [SessionState] 路径设置:`, {
    //   cwd: process.cwd(),
    //   sessionsFilePath: this.sessionsFilePath,
    //   dataSessionsFilePath: this.dataSessionsFilePath,
    //   sessionsExists: fs.existsSync(this.sessionsFilePath),
    //   dataSessionsExists: fs.existsSync(this.dataSessionsFilePath)
    // });
    
    this.loadSessions();
  }

  /**
   * 加载会话数据
   */
  public loadSessions(): void {
    try {
      this.sessionsData = [];
      
      // 从sessions目录加载WhatsApp会话
      if (fs.existsSync(this.sessionsFilePath)) {
        const data = fs.readFileSync(this.sessionsFilePath, 'utf8');
        const sessionsData = JSON.parse(data);
        this.sessionsData.push(...sessionsData);
        // console.log(` 从 sessions/sessions.json 加载了 ${sessionsData.length} 个会话`);
        // console.log(`📁 [SessionState] WhatsApp会话详情:`, sessionsData.map((s: any) => ({
        //   id: s.id,
        //   provider: s.provider,
        //   isActive: s.data?.isActive,
        //   label: s.label
        // })));
      } else {
        console.log(`⚠️ [SessionState] WhatsApp会话文件不存在: ${this.sessionsFilePath}`);
      }
      
      // 从data目录加载Telegram会话
      if (fs.existsSync(this.dataSessionsFilePath)) {
        const data = fs.readFileSync(this.dataSessionsFilePath, 'utf8');
        const dataSessions = JSON.parse(data);
        this.sessionsData.push(...dataSessions);
        // console.log(`📁 [SessionState] 从 data/sessions.json 加载了 ${dataSessions.length} 个会话`);
        // console.log(`📁 [SessionState] Telegram会话详情:`, dataSessions.map((s: any) => ({
        //   id: s.id,
        //   provider: s.provider,
        //   isActive: s.data?.isActive,
        //   label: s.label
        // })));
      } else {
        console.log(`⚠️ [SessionState] Telegram会话文件不存在: ${this.dataSessionsFilePath}`);
      }
      
      if (this.sessionsData.length === 0) {
        console.log(`⚠️ [SessionState] 未找到任何会话文件`);
      }

      // 为没有isActive字段的会话设置默认值true
      this.normalizeSessionData();
    } catch (error: any) {
      console.error(`❌ [SessionState] 加载会话数据失败:`, error.message);
      this.sessionsData = [];
    }
  }

  /**
   * 标准化会话数据，为缺少isActive字段的会话设置默认值
   */
  private normalizeSessionData(): void {
    let hasChanges = false;
    
    console.log(`🔍 [SessionState] 开始标准化会话数据，共 ${this.sessionsData.length} 个会话`);
    
    this.sessionsData.forEach(session => {
      // console.log(`🔍 [SessionState] 检查会话 ${session.id}:`, {
      //   hasData: !!session.data,
      //   isActiveValue: session.data?.isActive,
      //   isActiveType: typeof session.data?.isActive,
      //   isUndefined: typeof session.data?.isActive === 'undefined'
      // });
      
      if (session.data && typeof session.data.isActive === 'undefined') {
        session.data.isActive = true; // 默认设置为true
        hasChanges = true;
        console.log(`🔄 [SessionState] 为会话 ${session.id} 设置默认isActive=true`);
      }
    });

    // 如果有变化，保存更新后的数据
    if (hasChanges) {
      this.saveSessions();
      console.log(`💾 [SessionState] 已保存标准化后的会话数据`);
    }
  }

  /**
   * 保存会话数据
   */
  private saveSessions(): void {
    try {
      // 分离WhatsApp和Telegram数据
      const whatsappSessions = this.sessionsData.filter(s => s.provider === 'whatsapp');
      const telegramSessions = this.sessionsData.filter(s => s.provider === 'telegram');
      
      // 保存WhatsApp数据到sessions目录
      const dir = path.dirname(this.sessionsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(whatsappSessions, null, 2));
      
      // 保存Telegram数据到data目录
      const dataDir = path.dirname(this.dataSessionsFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dataSessionsFilePath, JSON.stringify(telegramSessions, null, 2));
      
      console.log(`💾 [SessionState] 会话数据已保存 - WhatsApp: ${whatsappSessions.length}, Telegram: ${telegramSessions.length}`);
    } catch (error: any) {
      console.error(`❌ [SessionState] 保存会话数据失败:`, error.message);
    }
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): SessionData[] {
    return [...this.sessionsData];
  }

  /**
   * 获取活跃的会话
   */
  getActiveSessions(): SessionData[] {
    return this.sessionsData.filter(session => {
      // 如果isActive未定义，默认为true
      const isActive = session.data.isActive !== undefined ? session.data.isActive : true;
      return isActive;
    });
  }

  /**
   * 获取指定提供商的活跃会话
   */
  getActiveSessionsByProvider(provider: 'whatsapp' | 'telegram'): SessionData[] {
    return this.sessionsData.filter(session => {
      // 如果isActive未定义，默认为true
      const isActive = session.data.isActive !== undefined ? session.data.isActive : true;
      return session.provider === provider && isActive;
    });
  }

  /**
   * 获取指定提供商的会话（包括非活跃）
   */
  getSessionsByProvider(provider: 'whatsapp' | 'telegram'): SessionData[] {
    return this.sessionsData.filter(session => session.provider === provider);
  }

  /**
   * 根据ID获取会话
   */
  getSessionById(id: string): SessionData | undefined {
    return this.sessionsData.find(session => session.id === id);
  }

  /**
   * 更新会话的活跃状态
   */
  updateSessionActiveStatus(id: string, isActive: boolean): boolean {
    console.log(`🔍 [SessionState] updateSessionActiveStatus 被调用: ${id} -> ${isActive}`);
    console.log(`🔍 [SessionState] 当前会话数据数量: ${this.sessionsData.length}`);
    console.log(`🔍 [SessionState] 当前会话ID列表:`, this.sessionsData.map(s => s.id));
    
    const session = this.sessionsData.find(s => s.id === id);
    if (!session) {
      console.log(`⚠️ [SessionState] 未找到会话: ${id}`);
      return false;
    }

    console.log(`🔍 [SessionState] 找到会话:`, {
      id: session.id,
      provider: session.provider,
      currentIsActive: session.data.isActive,
      isActive: isActive
    });

    const oldStatus = session.data.isActive;
    session.data.isActive = isActive;
    this.saveSessions();

    console.log(`🔄 [SessionState] 会话 ${id} 状态已更新: ${oldStatus} -> ${isActive}`);
    
    // 触发状态变化事件
    this.emitSessionStatusChange(id, session.provider, isActive);
    
    return true;
  }

  /**
   * 批量更新会话状态
   */
  updateMultipleSessionStatus(updates: { id: string; isActive: boolean }[]): void {
    let hasChanges = false;
    
    updates.forEach(({ id, isActive }) => {
      const session = this.sessionsData.find(s => s.id === id);
      if (session && session.data.isActive !== isActive) {
        session.data.isActive = isActive;
        hasChanges = true;
        console.log(`🔄 [SessionState] 会话 ${id} 状态已更新: ${!isActive} -> ${isActive}`);
        
        // 触发状态变化事件
        this.emitSessionStatusChange(id, session.provider, isActive);
      }
    });

    if (hasChanges) {
      this.saveSessions();
    }
  }

  /**
   * 触发会话状态变化事件
   */
  private emitSessionStatusChange(id: string, provider: 'whatsapp' | 'telegram', isActive: boolean): void {
    const eventData = {
      id,
      provider,
      isActive,
      timestamp: Date.now()
    };

    console.log(`📡 [SessionState] 准备触发会话状态变化事件:`, eventData);
    console.log(`📡 [SessionState] sessionStatusListenerService 状态:`, {
      listenerCount: sessionStatusListenerService.listenerCount('sessionStatusChanged'),
      hasListeners: sessionStatusListenerService.listenerCount('sessionStatusChanged') > 0
    });

    // 触发EventEmitter事件
    sessionStatusListenerService.emit('sessionStatusChanged', eventData);

    console.log(`📡 [SessionState] 会话状态变化事件已触发: ${provider}:${id} -> ${isActive ? '活跃' : '非活跃'}`);
  }

  /**
   * 重新加载会话数据
   */
  reloadSessions(): void {
    this.loadSessions();
    console.log(`🔄 [SessionState] 会话数据已重新加载`);
  }

  /**
   * 删除会话
   */
  public removeSession(id: string): boolean {
    const index = this.sessionsData.findIndex(s => s.id === id);
    if (index === -1) return false;

    const removed = this.sessionsData.splice(index, 1)[0];
    console.log(`🗑️ [SessionState] 会话已删除: ${id}`);

    // 保存更新后的会话数据
    this.saveSessions();

    // 触发事件，通知前端或其他服务
    this.emitSessionStatusChange(id, removed.provider, false);

    return true;
  }


  /**
   * 获取会话统计信息
   */
  getSessionStats(): {
    total: number;
    active: number;
    inactive: number;
    whatsapp: { total: number; active: number; inactive: number };
    telegram: { total: number; active: number; inactive: number };
  } {
    const total = this.sessionsData.length;
    
    // 使用默认值true处理未定义的isActive
    const active = this.sessionsData.filter(s => {
      const isActive = s.data.isActive !== undefined ? s.data.isActive : true;
      return isActive;
    }).length;
    const inactive = total - active;
    
    const whatsappSessions = this.sessionsData.filter(s => s.provider === 'whatsapp');
    const telegramSessions = this.sessionsData.filter(s => s.provider === 'telegram');
    
    return {
      total,
      active,
      inactive,
      whatsapp: {
        total: whatsappSessions.length,
        active: whatsappSessions.filter(s => {
          const isActive = s.data.isActive !== undefined ? s.data.isActive : true;
          return isActive;
        }).length,
        inactive: whatsappSessions.filter(s => {
          const isActive = s.data.isActive !== undefined ? s.data.isActive : true;
          return !isActive;
        }).length
      },
      telegram: {
        total: telegramSessions.length,
        active: telegramSessions.filter(s => {
          const isActive = s.data.isActive !== undefined ? s.data.isActive : true;
          return isActive;
        }).length,
        inactive: telegramSessions.filter(s => {
          const isActive = s.data.isActive !== undefined ? s.data.isActive : true;
          return !isActive;
        }).length
      }
    };
  }
}

// 导出单例实例
export const sessionStateService = new SessionStateService();
