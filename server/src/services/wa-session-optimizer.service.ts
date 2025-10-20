/**
 * WhatsApp Session Management Optimizer
 * 
 * This service provides optimized session management with:
 * - Parallel reconnection
 * - Health monitoring
 * - Automatic recovery
 * - Message history sync
 * - Performance metrics
 */

import { Client } from "@open-wa/wa-automate";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { waMessageMultiplexer } from "./wa-message-multiplexer.service";
import { waMessageOptimizer } from "./wa-message-optimizer.service";
import { create } from "@open-wa/wa-automate";
import path from "path";
import fs from "fs";
// Removed node-persist-redirect import as it's no longer needed

interface SessionHealth {
  accountId: string;
  isConnected: boolean;
  lastSeen: number;
  messageCount: number;
  connectionTime: number;
  healthScore: number; // 0-100
  issues: string[];
}

export interface ReconnectionResult {
  accountId: string;
  success: boolean;
  client?: Client;
  error?: string;
  reconnectionTime: number;
}

class WaSessionOptimizer {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private sessionHealth = new Map<string, SessionHealth>();
  private reconnectionQueue = new Set<string>();
  private isReconnecting = false;
  
  // Performance metrics
  private metrics = {
    totalReconnections: 0,
    successfulReconnections: 0,
    failedReconnections: 0,
    averageReconnectionTime: 0,
    lastHealthCheck: 0,
    messagesProcessed: 0
  };

  constructor() {
    console.log("🔧 WhatsApp Session Optimizer initialized");
    this.startHealthMonitoring();
    this.setupMessageTracking();
  }

  /**
   * Optimized parallel reconnection of all WhatsApp accounts
   */
  async reconnectAllAccounts(): Promise<ReconnectionResult[]> {
    console.log("🚀 Starting optimized WhatsApp account reconnection...");
    
    const whatsappAccounts = WhatsAppSessionsStore.list();
    console.log(`📋 Found ${whatsappAccounts.length} WhatsApp accounts to reconnect`);

    if (whatsappAccounts.length === 0) {
      console.log("✅ No WhatsApp accounts to reconnect");
      return [];
    }

    // Parallel reconnection with concurrency limit
    const CONCURRENCY_LIMIT = 3; // Limit concurrent reconnections
    const results: ReconnectionResult[] = [];
    
    for (let i = 0; i < whatsappAccounts.length; i += CONCURRENCY_LIMIT) {
      const batch = whatsappAccounts.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`🔄 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(whatsappAccounts.length / CONCURRENCY_LIMIT)}`);
      
      const batchPromises = batch.map(account => this.reconnectAccount(account));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            accountId: batch[index].id,
            success: false,
            error: result.reason?.message || 'Unknown error',
            reconnectionTime: 0
          });
        }
      });
      
      // Small delay between batches to avoid overwhelming the system
      if (i + CONCURRENCY_LIMIT < whatsappAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Update metrics
    this.updateReconnectionMetrics(results);
    
    // Validate all listeners
    const validation = waMessageMultiplexer.validateListeners();
    console.log(`📊 Reconnection validation:`, validation);

    console.log(`✅ Optimized reconnection completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Reconnect a single account with enhanced error handling
   */
  private async reconnectAccount(account: any): Promise<ReconnectionResult> {
    const startTime = Date.now();
    const accountId = account.id;
    
    try {
      console.log(`🔄 Reconnecting account: ${accountId} (${account.label})`);
      
      // Validate session directory exists - new storage method
      const sessionsRoot = account.data.dataDir;
      const sessionId = account.data.sessionId;
      
      if (!fs.existsSync(sessionsRoot)) {
        throw new Error(`Sessions directory not found: ${sessionsRoot}`);
      }

      // In new storage method, IGNORE folders are directly in sessions root
      const actualSessionDir = sessionId.startsWith('_IGNORE_') 
        ? path.join(sessionsRoot, sessionId)
        : path.join(sessionsRoot, `_IGNORE_${sessionId}`);
      
      if (!fs.existsSync(actualSessionDir)) {
        throw new Error(`Session data not found: ${actualSessionDir}`);
      }

      // Save original working directory
      const originalCwd = process.cwd();
      
      try {
        // Switch to sessions root directory
        process.chdir(sessionsRoot);
        
        // No longer need node-persist setup in new storage method
        
        // Create client with optimized settings
        const client = await create({
          sessionId: sessionId.replace('_IGNORE_', ''),
          multiDevice: true,
          headless: true,
          dataDir: '.',

          // Optimized connection settings
          qrTimeout: 15000, // Reduced timeout for faster failure detection
          authTimeout: 30000, // Reduced timeout
          qrLogSkip: true,
          disableSpins: true,
          killProcessOnBrowserClose: false,
          // 使用Puppeteer自动寻找Chrome路径，更可靠
          useChrome: true,
          // 让Puppeteer自动管理浏览器，避免路径问题
          autoRefresh: true,
          
          // Performance optimizations
          restartOnCrash: false,
          throwErrorOnTosBlock: false,
          bypassCSP: true,
          
          // Network optimizations
          chromiumArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images', // Disable images for faster loading
            '--disable-javascript', // Disable JS for faster loading
            '--memory-pressure-off'
          ]
        });
        
        // Wait for connection with timeout
        const connectionTimeout = 10000; // 10 seconds
        const connectionStart = Date.now();
        
        while (Date.now() - connectionStart < connectionTimeout) {
          try {
            const isConnected = await client.isConnected();
            if (isConnected) {
              break;
            }
          } catch (e) {
            // Continue waiting
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Verify connection
        const isConnected = await client.isConnected();
        if (!isConnected) {
          throw new Error('Failed to establish connection within timeout');
        }
        
        // Register with optimized message handler
        waMessageOptimizer.registerOptimizedHandler(accountId, client);
        
        // Sync recent messages
        await this.syncRecentMessages(client, accountId);
        
        // Update health status
        this.updateSessionHealth(accountId, true, []);
        
        const reconnectionTime = Date.now() - startTime;
        console.log(`✅ Account reconnected successfully: ${accountId} (${reconnectionTime}ms)`);
        
        // 🔑 等待一下确保重连完全稳定后再注册客户端
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 再次验证连接状态
        const isStillConnected = await client.isConnected();
        if (isStillConnected) {
          // 🔑 注册到全局客户端映射（关键：让WhatsApp Provider能找到客户端）
          const { getAllReconnectedWaClients } = await import('./startup-reconnect.service');
          const reconnectedWaClients = getAllReconnectedWaClients();
          reconnectedWaClients.set(accountId, client);
          console.log(`📊 [重连统计] 当前已注册客户端数量: ${reconnectedWaClients.size}`);
        } else {
          console.log(`⚠️ [重连警告] 客户端连接不稳定，跳过注册: ${accountId}`);
        }
        
        return {
          accountId,
          success: true,
          client,
          reconnectionTime
        };
        
      } finally {
        // Restore working directory
        process.chdir(originalCwd);
        // No longer need node-persist sync in new storage method
        delete process.env.NODE_PERSIST_DIR;
      }
      
    } catch (error: any) {
      const reconnectionTime = Date.now() - startTime;
      console.error(`❌ Failed to reconnect account ${accountId}:`, error.message);
      
      // Update health status with error
      this.updateSessionHealth(accountId, false, [error.message]);
      
      return {
        accountId,
        success: false,
        error: error.message,
        reconnectionTime
      };
    }
  }

  /**
   * Sync recent messages after reconnection
   */
  private async syncRecentMessages(client: Client, accountId: string): Promise<void> {
    try {
      console.log(`📨 Syncing recent messages for ${accountId}...`);
      
      const chats = await client.getAllChats();
      const recentChats = chats.slice(0, 5); // Limit to 5 most recent chats
      
      for (const chat of recentChats) {
        try {
          // Use getAllMessagesInChat instead of fetchMessages
          const messages = await client.getAllMessagesInChat(chat.id, true, true);
          const chatName = chat.name || (typeof chat.id === 'string' ? chat.id : 'Unknown');
          console.log(`📨 Found ${messages.length} recent messages in ${chatName}`);
          
          // Process each message as if it was just received
          for (const message of messages) {
            // Only process messages from the last 30 minutes
            const messageAge = Date.now() - (message.timestamp * 1000);
            if (messageAge < 30 * 60 * 1000) { // 30 minutes
              console.log(`📨 [Recovery] Processing missed message: ${message.body?.substring(0, 50)}...`);
              this.metrics.messagesProcessed++;
            }
          }
        } catch (chatError) {
          const chatId = typeof chat.id === 'string' ? chat.id : 'Unknown';
          console.log(`⚠️ Failed to sync messages for chat ${chatId}:`, chatError);
        }
      }
    } catch (error) {
      console.log(`⚠️ Message sync failed for ${accountId}:`, error);
    }
  }

  /**
   * Start health monitoring for all sessions
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // Check every 30 seconds
    
    console.log("🏥 Health monitoring started (30s interval)");
  }

  /**
   * Perform health check on all sessions
   */
  private async performHealthCheck(): Promise<void> {
    const accounts = WhatsAppSessionsStore.list();
    const healthChecks = accounts.map(account => this.checkAccountHealth(account));
    
    await Promise.allSettled(healthChecks);
    this.metrics.lastHealthCheck = Date.now();
  }

  /**
   * Check health of a single account
   */
  private async checkAccountHealth(account: any): Promise<void> {
    const accountId = account.id;
    const issues: string[] = [];
    
    try {
      // Check if client exists and is connected
      const client = waMessageMultiplexer.getRegisteredClients().includes(accountId) 
        ? waMessageMultiplexer.getClientStats(accountId) 
        : null;
      
      if (!client) {
        issues.push('Client not registered');
        this.updateSessionHealth(accountId, false, issues);
        return;
      }
      
      // Check session directory
      const sessionDir = account.data.dataDir;
      if (!fs.existsSync(sessionDir)) {
        issues.push('Session directory missing');
      }
      
      // Calculate health score
      let healthScore = 100;
      if (issues.length > 0) healthScore -= issues.length * 20;
      
      this.updateSessionHealth(accountId, true, issues, healthScore);
      
      // Auto-reconnect if health is poor
      if (healthScore < 50 && !this.reconnectionQueue.has(accountId)) {
        console.log(`🔄 Auto-reconnecting unhealthy account: ${accountId} (health: ${healthScore})`);
        this.reconnectionQueue.add(accountId);
        this.processReconnectionQueue();
      }
      
    } catch (error: any) {
      this.updateSessionHealth(accountId, false, [error.message]);
    }
  }

  /**
   * Update session health status
   */
  private updateSessionHealth(accountId: string, isConnected: boolean, issues: string[], healthScore: number = 0): void {
    const health: SessionHealth = {
      accountId,
      isConnected,
      lastSeen: Date.now(),
      messageCount: this.metrics.messagesProcessed,
      connectionTime: Date.now(),
      healthScore: healthScore || (isConnected ? 100 : 0),
      issues
    };
    
    this.sessionHealth.set(accountId, health);
  }

  /**
   * Process reconnection queue
   */
  private async processReconnectionQueue(): Promise<void> {
    if (this.isReconnecting || this.reconnectionQueue.size === 0) {
      return;
    }
    
    this.isReconnecting = true;
    console.log(`🔄 Processing reconnection queue: ${this.reconnectionQueue.size} accounts`);
    
    try {
      const accountsToReconnect = Array.from(this.reconnectionQueue);
      this.reconnectionQueue.clear();
      
      for (const accountId of accountsToReconnect) {
        const account = WhatsAppSessionsStore.get(accountId);
        if (account) {
          await this.reconnectAccount(account);
        }
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Setup message tracking for metrics
   */
  private setupMessageTracking(): void {
    // Track messages from the optimized handler
    waMessageOptimizer.on('message', async (message, accountId) => {
      this.metrics.messagesProcessed++;
      
      // Update session health on message received
      const health = this.sessionHealth.get(accountId);
      if (health) {
        health.lastSeen = Date.now();
        health.messageCount++;
        this.sessionHealth.set(accountId, health);
      }
    });
    
    // Also track from the original multiplexer for compatibility
    waMessageMultiplexer.subscribeToMessages(async (message) => {
      // This will be called by the optimized handler, so we don't double-count
    });
  }

  /**
   * Update reconnection metrics
   */
  private updateReconnectionMetrics(results: ReconnectionResult[]): void {
    this.metrics.totalReconnections += results.length;
    this.metrics.successfulReconnections += results.filter(r => r.success).length;
    this.metrics.failedReconnections += results.filter(r => !r.success).length;
    
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length > 0) {
      const avgTime = successfulResults.reduce((sum, r) => sum + r.reconnectionTime, 0) / successfulResults.length;
      this.metrics.averageReconnectionTime = avgTime;
    }
  }

  /**
   * Get session health status
   */
  getSessionHealth(): Map<string, SessionHealth> {
    return this.sessionHealth;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeSessions: this.sessionHealth.size,
      healthySessions: Array.from(this.sessionHealth.values()).filter(h => h.healthScore > 80).length,
      unhealthySessions: Array.from(this.sessionHealth.values()).filter(h => h.healthScore <= 50).length
    };
  }

  /**
   * Force reconnection of a specific account
   */
  async forceReconnect(accountId: string): Promise<boolean> {
    const account = WhatsAppSessionsStore.get(accountId);
    if (!account) {
      console.log(`❌ Account not found: ${accountId}`);
      return false;
    }
    
    console.log(`🔄 Force reconnecting account: ${accountId}`);
    const result = await this.reconnectAccount(account);
    return result.success;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log("🧹 WhatsApp Session Optimizer destroyed");
  }
}

// Export singleton instance
export const waSessionOptimizer = new WaSessionOptimizer();
