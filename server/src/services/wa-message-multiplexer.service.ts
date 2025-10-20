/**
 * WhatsApp Message Event Multiplexer
 * 
 * This service provides centralized message event handling for multiple WhatsApp clients.
 * It solves the multi-client monitoring limitation by:
 * 1. Managing independent message listeners for each WhatsApp account
 * 2. Multiplexing message events from all connected clients
 * 3. Providing a unified interface for message processing
 */

import { Client, Message } from "@open-wa/wa-automate";
import EventEmitter from "events";

// Message event handler type
type MessageHandler = (message: Message) => void | Promise<void>;

/**
 * Message Multiplexer Service
 * Handles message events from multiple WhatsApp clients independently
 */
class WaMessageMultiplexer extends EventEmitter {
  // Store active message listeners for each client
  private clientListeners = new Map<string, MessageHandler>();
  
  // Store registered clients
  private registeredClients = new Map<string, Client>();
  
  // Global message handlers (subscribed by other services)
  private globalHandlers: MessageHandler[] = [];
  
  // Message statistics for monitoring
  private messageStats = new Map<string, {
    accountId: string;
    messageCount: number;
    lastMessageTime: number;
    isActive: boolean;
  }>();

  constructor() {
    super();
    console.log("🔧 WhatsApp Message Multiplexer initialized");
  }

  /**
   * Register a WhatsApp client for message monitoring
   * This should be called whenever a client connects (initial or reconnect)
   */
  registerClient(accountId: string, client: Client): void {
    if (this.registeredClients.has(accountId)) {
      console.log(`⚠️ Client already registered, updating: ${accountId}`);
      // Remove old listener first
      this.unregisterClient(accountId);
    }

    console.log(`📱 Registering WhatsApp client for message monitoring: ${accountId}`);

    // Create a dedicated message handler for this client
    const messageHandler: MessageHandler = async (message: Message) => {
      try {
        // Update message statistics
        this.updateMessageStats(accountId, message);
        
        // Log incoming message
        console.log(`📨 [${accountId}] New message from ${message.from}: ${message.body?.substring(0, 50)}...`);
        
        // Emit to this service's event emitter
        this.emit('message', message, accountId);
        
        // Call all global handlers
        for (const handler of this.globalHandlers) {
          try {
            await handler(message);
          } catch (handlerError) {
            console.error(`❌ Error in global message handler for ${accountId}:`, handlerError);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing message for ${accountId}:`, error);
      }
    };

    // Attach the listener to the client
    client.onMessage(messageHandler);

    // Store the listener and client reference
    this.clientListeners.set(accountId, messageHandler);
    this.registeredClients.set(accountId, client);

    // Initialize stats
    this.messageStats.set(accountId, {
      accountId,
      messageCount: 0,
      lastMessageTime: 0,
      isActive: true
    });

    console.log(`✅ Message listener registered for ${accountId}`);
    console.log(`📊 Total active listeners: ${this.registeredClients.size}`);
  }

  /**
   * Unregister a client from message monitoring
   */
  unregisterClient(accountId: string): void {
    console.log(`🔌 Unregistering client: ${accountId}`);
    
    this.clientListeners.delete(accountId);
    this.registeredClients.delete(accountId);
    
    // Mark stats as inactive
    const stats = this.messageStats.get(accountId);
    if (stats) {
      stats.isActive = false;
    }
    
    console.log(`✅ Client unregistered: ${accountId}`);
    console.log(`📊 Remaining active listeners: ${this.registeredClients.size}`);
  }

  /**
   * Subscribe to all message events
   * Use this to add application-level message handlers
   */
  subscribeToMessages(handler: MessageHandler): void {
    this.globalHandlers.push(handler);
    console.log(`📬 New global message handler subscribed. Total handlers: ${this.globalHandlers.length}`);
  }

  /**
   * Unsubscribe from message events
   */
  unsubscribeFromMessages(handler: MessageHandler): void {
    const index = this.globalHandlers.indexOf(handler);
    if (index > -1) {
      this.globalHandlers.splice(index, 1);
      console.log(`📭 Global message handler unsubscribed. Remaining handlers: ${this.globalHandlers.length}`);
    }
  }

  /**
   * Update message statistics for monitoring
   */
  private updateMessageStats(accountId: string, message: Message): void {
    const stats = this.messageStats.get(accountId);
    if (stats) {
      stats.messageCount++;
      stats.lastMessageTime = Date.now();
    }
  }

  /**
   * Get message statistics for all clients
   */
  getMessageStats() {
    return Array.from(this.messageStats.values());
  }

  /**
   * Get statistics for a specific client
   */
  getClientStats(accountId: string) {
    return this.messageStats.get(accountId);
  }

  /**
   * Check if a client is registered
   */
  isClientRegistered(accountId: string): boolean {
    return this.registeredClients.has(accountId);
  }

  /**
   * Get all registered client IDs
   */
  getRegisteredClients(): string[] {
    return Array.from(this.registeredClients.keys());
  }

  /**
   * Get total number of registered clients
   */
  getRegisteredClientCount(): number {
    return this.registeredClients.size;
  }

  /**
   * Validate that all connected accounts have active listeners
   */
  validateListeners(): {
    valid: boolean;
    registeredCount: number;
    activeCount: number;
    missingListeners: string[];
  } {
    const activeAccounts = Array.from(this.messageStats.values())
      .filter(stat => stat.isActive)
      .map(stat => stat.accountId);

    const registeredAccounts = this.getRegisteredClients();
    
    const missingListeners = activeAccounts.filter(
      accountId => !registeredAccounts.includes(accountId)
    );

    const result = {
      valid: missingListeners.length === 0,
      registeredCount: registeredAccounts.length,
      activeCount: activeAccounts.length,
      missingListeners
    };

    if (!result.valid) {
      console.warn(`⚠️ Validation failed: ${missingListeners.length} accounts missing listeners`, missingListeners);
    } else {
      console.log(`✅ Validation passed: All ${result.activeCount} accounts have active listeners`);
    }

    return result;
  }

  /**
   * Clear all listeners (for cleanup/testing)
   */
  clearAllListeners(): void {
    console.log(`🧹 Clearing all message listeners (${this.registeredClients.size} clients)`);
    
    this.clientListeners.clear();
    this.registeredClients.clear();
    this.globalHandlers = [];
    
    // Mark all stats as inactive
    this.messageStats.forEach(stat => {
      stat.isActive = false;
    });
    
    console.log(`✅ All listeners cleared`);
  }
}

// Export singleton instance
export const waMessageMultiplexer = new WaMessageMultiplexer();

// Example usage for application-level message processing
// You can subscribe to messages like this:
//
// waMessageMultiplexer.subscribeToMessages(async (message, accountId) => {
//   console.log(`Processing message from ${accountId}: ${message.body}`);
//   // Your message processing logic here
//   // - Save to database
//   // - Trigger AI responses
//   // - Forward to other services
// });

