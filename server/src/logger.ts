import * as fs from 'fs';
import * as path from 'path';

// Type definitions for logger
interface LogEntry {
    timestamp: string;
    level: 'ERROR' | 'WARN' | 'INFO' | 'FATAL';
    service: string;
    module: string;
    function: string;
    message: string;
    sessionId?: string;
    requestId?: string;
    details: Record<string, any>;
    context?: {
        ip?: string;
        userAgent?: string;
        userId?: string;
    };
    tags: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    alertable: boolean;
}

interface WhatsAppSessionErrorDetails {
    error: string;
    provider: string;
    sessionState: string;
    timeout: number;
    retryCount: number;
}

interface TelegramConnectionErrorDetails {
    error: string;
    provider: string;
    apiId: string;
    errorCode: string;
}

interface ServerHealthIssueDetails {
    error: string;
    component: string;
    status: string;
    responseTime: number;
    lastSuccessfulCheck: string;
}

interface ApiRequestErrorDetails {
    error: string;
    endpoint: string;
    method: string;
    statusCode: number;
    validationErrors: string[];
}

interface BusinessLogicEventDetails {
    action: string;
    previousStatus: string;
    newStatus: string;
    reason: string;
    provider: string;
}

interface RequestContext {
    ip?: string;
    userAgent?: string;
    userId?: string;
}

class Logger {
    private logsDir: string;

    constructor() {
        this.logsDir = path.join(__dirname, '..', 'logs');
        this.ensureLogsDirectory();
    }

    private ensureLogsDirectory(): void {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    private getCurrentDate(): string {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    private getCurrentTimestamp(): string {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2); // YY
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // MM
        const day = now.getDate().toString().padStart(2, '0'); // DD
        const hours = now.getHours().toString().padStart(2, '0'); // HH
        const minutes = now.getMinutes().toString().padStart(2, '0'); // MM
        const seconds = now.getSeconds().toString().padStart(2, '0'); // SS
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    private getLogFileName(service: string, level: string): string {
        const date = this.getCurrentDate();
        return `${service}-${level}-${date}.jsonl`;
    }

    private writeLogEntry(logEntry: LogEntry): void {
        const fileName = this.getLogFileName(logEntry.service, logEntry.level.toLowerCase());
        const filePath = path.join(this.logsDir, fileName);
        const logLine = JSON.stringify(logEntry, null, 2) + '\n';
        
        fs.appendFileSync(filePath, logLine, 'utf8');
        console.log(`Log written to: ${fileName}`);
    }

    // 1. WhatsApp Session Errors
    logWhatsAppSessionError(
        sessionId: string, 
        error: string, 
        provider: string = 'whatsapp', 
        sessionState: string = 'qr-pending', 
        timeout: number = 30000, 
        retryCount: number = 0
    ): void {
        const logEntry: LogEntry = {
            timestamp: this.getCurrentTimestamp(),
            level: "ERROR",
            service: "chatx-backend",
            module: "wa-session-manager",
            function: "createSession",
            message: "WhatsApp session creation failed",
            sessionId: sessionId,
            details: {
                error: error,
                provider: provider,
                sessionState: sessionState,
                timeout: timeout,
                retryCount: retryCount
            } as WhatsAppSessionErrorDetails,
            tags: ["whatsapp", "qr-timeout", "session-creation"],
            severity: "high",
            alertable: true
        };

        this.writeLogEntry(logEntry);
    }

    // 2. Telegram Connection Errors
    logTelegramConnectionError(
        sessionId: string, 
        error: string, 
        apiId: string, 
        errorCode: string = 'AUTH_KEY_INVALID'
    ): void {
        const logEntry: LogEntry = {
            timestamp: this.getCurrentTimestamp(),
            level: "ERROR",
            service: "chatx-backend",
            module: "tg-service",
            function: "connectAccount",
            message: "Telegram connection failed",
            sessionId: sessionId,
            details: {
                error: error,
                provider: "telegram",
                apiId: apiId,
                errorCode: errorCode
            } as TelegramConnectionErrorDetails,
            tags: ["telegram", "auth", "credentials"],
            severity: "high",
            alertable: true
        };

        this.writeLogEntry(logEntry);
    }

    // 3. Server Health Issues
    logServerHealthIssue(
        error: string, 
        component: string = 'database', 
        status: string = 'down', 
        responseTime: number = 5000, 
        lastSuccessfulCheck: string | null = null
    ): void {
        const logEntry: LogEntry = {
            timestamp: this.getCurrentTimestamp(),
            level: "FATAL",
            service: "chatx-backend",
            module: "server",
            function: "healthCheck",
            message: "Server health check failed",
            details: {
                error: error,
                component: component,
                status: status,
                responseTime: responseTime,
                lastSuccessfulCheck: lastSuccessfulCheck || this.getCurrentTimestamp()
            } as ServerHealthIssueDetails,
            tags: ["server", "health", component, "critical"],
            severity: "critical",
            alertable: true
        };

        this.writeLogEntry(logEntry);
    }

    // 4. API Request Errors
    logApiRequestError(
        requestId: string, 
        error: string, 
        endpoint: string, 
        method: string = 'POST', 
        statusCode: number = 400, 
        validationErrors: string[] = [], 
        context: RequestContext = {}
    ): void {
        const logEntry: LogEntry = {
            timestamp: this.getCurrentTimestamp(),
            level: "WARN",
            service: "chatx-backend",
            module: "api-middleware",
            function: "validateRequest",
            message: "Invalid API request",
            requestId: requestId,
            details: {
                error: error,
                endpoint: endpoint,
                method: method,
                statusCode: statusCode,
                validationErrors: validationErrors
            } as ApiRequestErrorDetails,
            context: {
                ip: context.ip || "unknown",
                userAgent: context.userAgent || "unknown",
                userId: context.userId || "unknown"
            },
            tags: ["api", "validation", "bad-request"],
            severity: "medium",
            alertable: false
        };

        this.writeLogEntry(logEntry);
    }

    // 5. Business Logic Events
    logBusinessLogicEvent(
        sessionId: string, 
        action: string, 
        previousStatus: string, 
        newStatus: string, 
        reason: string = 'user-requested', 
        provider: string = 'whatsapp'
    ): void {
        const logEntry: LogEntry = {
            timestamp: this.getCurrentTimestamp(),
            level: "INFO",
            service: "chatx-backend",
            module: "account-management",
            function: "toggleAccount",
            message: "Account status changed",
            sessionId: sessionId,
            details: {
                action: action,
                previousStatus: previousStatus,
                newStatus: newStatus,
                reason: reason,
                provider: provider
            } as BusinessLogicEventDetails,
            tags: ["account", "status-change", "user-action"],
            severity: "low",
            alertable: false
        };

        this.writeLogEntry(logEntry);
    }

    // Utility function to clean up old log files (7 days retention)
    cleanupOldLogs(): void {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        try {
            const files = fs.readdirSync(this.logsDir);
            
            files.forEach(file => {
                if (file.endsWith('.jsonl')) {
                    const filePath = path.join(this.logsDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < sevenDaysAgo) {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted old log file: ${file}`);
                    }
                }
            });
        } catch (error) {
            console.error('Error cleaning up old logs:', error);
        }
    }

    // Utility function to get all log files
    getLogFiles(): string[] {
        try {
            return fs.readdirSync(this.logsDir).filter(file => file.endsWith('.jsonl'));
        } catch (error) {
            console.error('Error reading log files:', error);
            return [];
        }
    }

    // Utility function to read specific log file
    readLogFile(fileName: string): LogEntry[] {
        try {
            const filePath = path.join(this.logsDir, fileName);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const entries: LogEntry[] = [];
            const lines = content.split('\n');
            let currentJson = '';
            let braceCount = 0;
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                
                currentJson += line + '\n';
                
                // Count braces to determine when a JSON object is complete
                for (const char of line) {
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;
                }
                
                // When brace count reaches 0, we have a complete JSON object
                if (braceCount === 0 && currentJson.trim()) {
                    try {
                        entries.push(JSON.parse(currentJson.trim()) as LogEntry);
                    } catch (parseError) {
                        console.warn(`Failed to parse JSON entry: ${parseError}`);
                    }
                    currentJson = '';
                }
            }
            
            return entries;
        } catch (error) {
            console.error(`Error reading log file ${fileName}:`, error);
            return [];
        }
    }
}

// Create and export a singleton instance
const logger = new Logger();

// Export individual functions for easier importing
export const logWhatsAppSessionError = (
    sessionId: string, 
    error: string, 
    provider?: string, 
    sessionState?: string, 
    timeout?: number, 
    retryCount?: number
) => logger.logWhatsAppSessionError(sessionId, error, provider, sessionState, timeout, retryCount);

export const logTelegramConnectionError = (
    sessionId: string, 
    error: string, 
    apiId: string, 
    errorCode?: string
) => logger.logTelegramConnectionError(sessionId, error, apiId, errorCode);

export const logServerHealthIssue = (
    error: string, 
    component?: string, 
    status?: string, 
    responseTime?: number, 
    lastSuccessfulCheck?: string | null
) => logger.logServerHealthIssue(error, component, status, responseTime, lastSuccessfulCheck);

export const logApiRequestError = (
    requestId: string, 
    error: string, 
    endpoint: string, 
    method?: string, 
    statusCode?: number, 
    validationErrors?: string[], 
    context?: RequestContext
) => logger.logApiRequestError(requestId, error, endpoint, method, statusCode, validationErrors, context);

export const logBusinessLogicEvent = (
    sessionId: string, 
    action: string, 
    previousStatus: string, 
    newStatus: string, 
    reason?: string, 
    provider?: string
) => logger.logBusinessLogicEvent(sessionId, action, previousStatus, newStatus, reason, provider);

// Utility functions
export const getLogFiles = (): string[] => logger.getLogFiles();
export const readLogFile = (fileName: string): LogEntry[] => logger.readLogFile(fileName);
export const cleanupOldLogs = (): void => logger.cleanupOldLogs();

// Export the full logger instance for advanced usage
export { logger };

// Default export
export default logger;
