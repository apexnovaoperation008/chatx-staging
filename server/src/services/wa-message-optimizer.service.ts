/**
 * WhatsApp Message Handling Optimizer
 * 
 * This service provides optimized message handling with:
 * - Message queuing and batching
 * - Rate limiting and throttling
 * - Message filtering and deduplication
 * - Async processing with worker pools
 * - Message persistence and recovery
 * - Performance metrics and monitoring
 */

import { EventEmitter } from 'events';
import { Client, Message } from '@open-wa/wa-automate';
import { waMessageMultiplexer } from './wa-message-multiplexer.service';

interface MessageQueueItem {
  message: Message;
  accountId: string;
  timestamp: number;
  priority: number;
  retryCount: number;
}

interface MessageFilter {
  accountId?: string;
  from?: string;
  messageType?: string;
  containsText?: string;
  excludeGroups?: boolean;
  excludeSelf?: boolean;
}

interface ProcessingStats {
  totalProcessed: number;
  totalFiltered: number;
  totalErrors: number;
  averageProcessingTime: number;
  queueSize: number;
  lastProcessed: number;
}

interface RateLimitConfig {
  maxMessagesPerSecond: number;
  maxMessagesPerMinute: number;
  burstLimit: number;
}

class WaMessageOptimizer extends EventEmitter {
  private messageQueue: MessageQueueItem[] = [];
  private processingQueue = new Set<string>();
  private messageCache = new Map<string, number>();
  private rateLimitCounters = new Map<string, { second: number, minute: number, lastReset: number }>();
  private processingStats: ProcessingStats = {
    totalProcessed: 0,
    totalFiltered: 0,
    totalErrors: 0,
    averageProcessingTime: 0,
    queueSize: 0,
    lastProcessed: 0
  };
  
  // Configuration
  private readonly config = {
    maxQueueSize: 1000,
    batchSize: 10,
    batchTimeout: 100, // ms
    maxRetries: 3,
    retryDelay: 1000, // ms
    deduplicationWindow: 5000, // ms
    rateLimit: {
      maxMessagesPerSecond: 50,
      maxMessagesPerMinute: 1000,
      burstLimit: 100
    } as RateLimitConfig
  };
  
  // Processing workers
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private batchTimeout: NodeJS.Timeout | null = null;
  private currentBatch: MessageQueueItem[] = [];
  
  // Message filters
  private globalFilters: MessageFilter[] = [];
  private accountFilters = new Map<string, MessageFilter[]>();
  
  // Performance monitoring
  private performanceMetrics = {
    processingTimes: [] as number[],
    queueDepths: [] as number[],
    errorRates: [] as number[],
    throughput: [] as number[]
  };

  constructor() {
    super();
    console.log("🚀 WhatsApp Message Optimizer initialized");
    this.startProcessing();
    this.setupPerformanceMonitoring();
  }

  /**
   * Register optimized message handler for a client
   */
  registerOptimizedHandler(accountId: string, client: Client): void {
    console.log(`📱 Registering optimized message handler for: ${accountId}`);
    
    // Create optimized message handler
    const optimizedHandler = async (message: Message) => {
      const startTime = Date.now();
      
      try {
        // Quick validation
        if (!this.isValidMessage(message)) {
          this.processingStats.totalFiltered++;
          return;
        }
        
        // Rate limiting check
        if (!this.checkRateLimit(accountId)) {
          console.log(`⚠️ Rate limit exceeded for ${accountId}, message queued`);
          this.addToQueue(message, accountId, 1); // Lower priority for rate limited
          return;
        }
        
        // Deduplication check
        if (this.isDuplicateMessage(message)) {
          this.processingStats.totalFiltered++;
          return;
        }
        
        // Apply filters
        if (!this.passesFilters(message, accountId)) {
          this.processingStats.totalFiltered++;
          return;
        }
        
        // Add to processing queue
        this.addToQueue(message, accountId, 0); // High priority for normal messages
        
        // Update cache for deduplication
        this.updateMessageCache(message);
        
        const processingTime = Date.now() - startTime;
        this.updatePerformanceMetrics(processingTime);
        
      } catch (error) {
        console.error(`❌ Error in optimized message handler for ${accountId}:`, error);
        this.processingStats.totalErrors++;
      }
    };
    
    // Attach to client
    client.onMessage(optimizedHandler);
    
    // Also register with the original multiplexer for compatibility
    waMessageMultiplexer.registerClient(accountId, client);
    
    console.log(`✅ Optimized message handler registered for ${accountId}`);
  }

  /**
   * Add message to processing queue
   */
  private addToQueue(message: Message, accountId: string, priority: number): void {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      console.log(`⚠️ Message queue full, dropping oldest message`);
      this.messageQueue.shift(); // Remove oldest
    }
    
    const queueItem: MessageQueueItem = {
      message,
      accountId,
      timestamp: Date.now(),
      priority,
      retryCount: 0
    };
    
    // Insert based on priority (lower number = higher priority)
    const insertIndex = this.messageQueue.findIndex(item => item.priority > priority);
    if (insertIndex === -1) {
      this.messageQueue.push(queueItem);
    } else {
      this.messageQueue.splice(insertIndex, 0, queueItem);
    }
    
    this.processingStats.queueSize = this.messageQueue.length;
    this.emit('messageQueued', queueItem);
  }

  /**
   * Start message processing
   */
  private startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log("🔄 Starting optimized message processing");
    
    // Process messages in batches
    this.processingInterval = setInterval(() => {
      this.processBatch();
    }, this.config.batchTimeout);
  }

  /**
   * Process a batch of messages
   */
  private async processBatch(): Promise<void> {
    if (this.messageQueue.length === 0) return;
    
    // Take up to batchSize messages
    const batch = this.messageQueue.splice(0, this.config.batchSize);
    this.processingStats.queueSize = this.messageQueue.length;
    
    if (batch.length === 0) return;
    
    console.log(`🔄 Processing batch of ${batch.length} messages`);
    
    // Process messages in parallel
    const processingPromises = batch.map(item => this.processMessage(item));
    const results = await Promise.allSettled(processingPromises);
    
    // Handle results
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const item = batch[index];
        console.error(`❌ Failed to process message from ${item.accountId}:`, result.reason);
        
        // Retry logic
        if (item.retryCount < this.config.maxRetries) {
          item.retryCount++;
          setTimeout(() => {
            this.addToQueue(item.message, item.accountId, item.priority + 1);
          }, this.config.retryDelay * item.retryCount);
        } else {
          this.processingStats.totalErrors++;
        }
      }
    });
    
    this.processingStats.totalProcessed += batch.length;
    this.processingStats.lastProcessed = Date.now();
  }

  /**
   * Process individual message
   */
  private async processMessage(item: MessageQueueItem): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Emit to original multiplexer for compatibility
      waMessageMultiplexer.emit('message', item.message, item.accountId);
      
      // Emit to this service's subscribers
      this.emit('message', item.message, item.accountId);
      
      // Log with optimized format
      const messagePreview = this.getMessagePreview(item.message);
      console.log(`📨 [${item.accountId}] ${messagePreview}`);
      
      const processingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(processingTime);
      
    } catch (error) {
      console.error(`❌ Error processing message for ${item.accountId}:`, error);
      throw error;
    }
  }

  /**
   * Validate message
   */
  private isValidMessage(message: Message): boolean {
    return !!(
      message &&
      message.from &&
      message.timestamp &&
      message.id
    );
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(accountId: string): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(accountId) || {
      second: 0,
      minute: 0,
      lastReset: now
    };
    
    // Reset counters if needed
    if (now - counter.lastReset > 60000) { // 1 minute
      counter.second = 0;
      counter.minute = 0;
      counter.lastReset = now;
    }
    
    // Check limits
    if (counter.second >= this.config.rateLimit.maxMessagesPerSecond) {
      return false;
    }
    
    if (counter.minute >= this.config.rateLimit.maxMessagesPerMinute) {
      return false;
    }
    
    // Update counters
    counter.second++;
    counter.minute++;
    this.rateLimitCounters.set(accountId, counter);
    
    return true;
  }

  /**
   * Check for duplicate messages
   */
  private isDuplicateMessage(message: Message): boolean {
    const messageKey = `${message.from}_${message.id}_${message.timestamp}`;
    const lastSeen = this.messageCache.get(messageKey);
    
    if (lastSeen && (Date.now() - lastSeen) < this.config.deduplicationWindow) {
      return true;
    }
    
    return false;
  }

  /**
   * Update message cache for deduplication
   */
  private updateMessageCache(message: Message): void {
    const messageKey = `${message.from}_${message.id}_${message.timestamp}`;
    this.messageCache.set(messageKey, Date.now());
    
    // Clean old entries periodically
    if (this.messageCache.size > 1000) {
      const now = Date.now();
      for (const [key, timestamp] of this.messageCache.entries()) {
        if (now - timestamp > this.config.deduplicationWindow) {
          this.messageCache.delete(key);
        }
      }
    }
  }

  /**
   * Apply message filters
   */
  private passesFilters(message: Message, accountId: string): boolean {
    // Apply global filters
    for (const filter of this.globalFilters) {
      if (!this.messageMatchesFilter(message, filter)) {
        return false;
      }
    }
    
    // Apply account-specific filters
    const accountFilterList = this.accountFilters.get(accountId) || [];
    for (const filter of accountFilterList) {
      if (!this.messageMatchesFilter(message, filter)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if message matches filter
   */
  private messageMatchesFilter(message: Message, filter: MessageFilter): boolean {
    if (filter.from && message.from !== filter.from) {
      return false;
    }
    
    if (filter.messageType && message.type !== filter.messageType) {
      return false;
    }
    
    if (filter.containsText && !message.body?.includes(filter.containsText)) {
      return false;
    }
    
    if (filter.excludeGroups && message.isGroupMsg) {
      return false;
    }
    
    if (filter.excludeSelf && message.fromMe) {
      return false;
    }
    
    return true;
  }

  /**
   * Get optimized message preview
   */
  private getMessagePreview(message: Message): string {
    const from = message.fromMe ? 'You' : message.from;
    const type = message.type || 'text';
    const body = message.body?.substring(0, 30) || `[${type}]`;
    
    return `${from}: ${body}${message.body && message.body.length > 30 ? '...' : ''}`;
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(processingTime: number): void {
    this.performanceMetrics.processingTimes.push(processingTime);
    this.performanceMetrics.queueDepths.push(this.messageQueue.length);
    
    // Keep only last 100 measurements
    if (this.performanceMetrics.processingTimes.length > 100) {
      this.performanceMetrics.processingTimes.shift();
      this.performanceMetrics.queueDepths.shift();
    }
    
    // Calculate average processing time
    const totalTime = this.performanceMetrics.processingTimes.reduce((sum, time) => sum + time, 0);
    this.processingStats.averageProcessingTime = totalTime / this.performanceMetrics.processingTimes.length;
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const throughput = this.processingStats.totalProcessed / ((now - this.processingStats.lastProcessed) / 1000);
      this.performanceMetrics.throughput.push(throughput);
      
      if (this.performanceMetrics.throughput.length > 100) {
        this.performanceMetrics.throughput.shift();
      }
      
      // Log performance summary every 5 minutes
      if (now % 300000 < 60000) { // Every 5 minutes
        console.log(`📊 Message Processing Stats:`);
        console.log(`   Processed: ${this.processingStats.totalProcessed}`);
        console.log(`   Filtered: ${this.processingStats.totalFiltered}`);
        console.log(`   Errors: ${this.processingStats.totalErrors}`);
        console.log(`   Queue Size: ${this.processingStats.queueSize}`);
        console.log(`   Avg Processing Time: ${Math.round(this.processingStats.averageProcessingTime)}ms`);
      }
    }, 60000); // Every minute
  }

  /**
   * Add global message filter
   */
  addGlobalFilter(filter: MessageFilter): void {
    this.globalFilters.push(filter);
    console.log(`🔍 Added global message filter:`, filter);
  }

  /**
   * Add account-specific filter
   */
  addAccountFilter(accountId: string, filter: MessageFilter): void {
    if (!this.accountFilters.has(accountId)) {
      this.accountFilters.set(accountId, []);
    }
    this.accountFilters.get(accountId)!.push(filter);
    console.log(`🔍 Added filter for ${accountId}:`, filter);
  }

  /**
   * Remove global filter
   */
  removeGlobalFilter(filter: MessageFilter): void {
    const index = this.globalFilters.findIndex(f => JSON.stringify(f) === JSON.stringify(filter));
    if (index !== -1) {
      this.globalFilters.splice(index, 1);
    }
  }

  /**
   * Remove account filter
   */
  removeAccountFilter(accountId: string, filter: MessageFilter): void {
    const filters = this.accountFilters.get(accountId);
    if (filters) {
      const index = filters.findIndex(f => JSON.stringify(f) === JSON.stringify(filter));
      if (index !== -1) {
        filters.splice(index, 1);
      }
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): ProcessingStats {
    return { ...this.processingStats };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      currentQueueSize: this.messageQueue.length,
      rateLimitCounters: Object.fromEntries(this.rateLimitCounters),
      activeFilters: {
        global: this.globalFilters.length,
        account: Object.fromEntries(
          Array.from(this.accountFilters.entries()).map(([id, filters]) => [id, filters.length])
        )
      }
    };
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
    this.processingStats.queueSize = 0;
    console.log("🧹 Message queue cleared");
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    Object.assign(this.config, newConfig);
    console.log("⚙️ Message optimizer configuration updated");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    this.isProcessing = false;
    this.messageQueue = [];
    this.messageCache.clear();
    this.rateLimitCounters.clear();
    
    console.log("🧹 WhatsApp Message Optimizer destroyed");
  }
}

// Export singleton instance
export const waMessageOptimizer = new WaMessageOptimizer();
