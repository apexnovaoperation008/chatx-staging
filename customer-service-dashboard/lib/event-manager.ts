/**
 * 统一的事件监听器管理器
 * 用于管理全局事件监听器，避免重复代码
 */

export type EventHandler = (event?: CustomEvent) => void;

export class EventManager {
  private static instance: EventManager;
  private handlers: Map<string, Set<EventHandler>> = new Map();

  private constructor() {}

  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  /**
   * 添加事件监听器
   */
  addEventListener(eventName: string, handler: EventHandler): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
    
    // 如果是第一次添加该事件，设置全局监听器
    if (this.handlers.get(eventName)!.size === 1) {
      window.addEventListener(eventName, this.handleGlobalEvent.bind(this));
    }
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(eventName: string, handler: EventHandler): void {
    const eventHandlers = this.handlers.get(eventName);
    if (eventHandlers) {
      eventHandlers.delete(handler);
      
      // 如果没有监听器了，移除全局监听器
      if (eventHandlers.size === 0) {
        window.removeEventListener(eventName, this.handleGlobalEvent.bind(this));
        this.handlers.delete(eventName);
      }
    }
  }

  /**
   * 处理全局事件
   */
  private handleGlobalEvent(event: Event): void {
    const customEvent = event as CustomEvent;
    const eventName = event.type;
    const handlers = this.handlers.get(eventName);
    
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(customEvent);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * 清理所有事件监听器
   */
  cleanup(): void {
    this.handlers.forEach((_, eventName) => {
      window.removeEventListener(eventName, this.handleGlobalEvent.bind(this));
    });
    this.handlers.clear();
  }
}

// 导出单例实例
export const eventManager = EventManager.getInstance();

// 常用事件类型
export const ACCOUNT_EVENTS = {
  ADDED: 'accountAdded',
  REFRESH: 'refreshAccounts', 
  DATA_CHANGED: 'accountDataChanged'
} as const;

export const CHAT_EVENTS = {
  NEW_MESSAGE: 'chatx:newMessage',
  MEDIA_DOWNLOADED: 'chatx:mediaDownloaded'
} as const;


