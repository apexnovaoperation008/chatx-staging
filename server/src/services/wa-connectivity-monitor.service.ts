import { Client, STATE } from "@open-wa/wa-automate";
import EventEmitter from "events";
import { DatabaseService } from "../database/database.service"; 
import fs from "fs";
import path from "path";
import io from "@/app"
import { websocketService } from '../services/websocket.service';

/**
 * WhatsApp Connectivity Tracker + Session Cleanup
 * - Handles connection state, disconnection, unlink, and logout
 * - Cleans up session files/folders on logout
 */
class WaConnectivityTracker extends EventEmitter {
  private clientStates = new Map<string, string>();
  private lastChangeTime = new Map<string, number>();
  private watchdogs = new Map<string, NodeJS.Timeout>();

  private sessionDir = path.resolve("./sessions");

  constructor() {
    super();
    console.log("📡 WhatsApp Connectivity Tracker initialized");
  }

  /** Register a WhatsApp client for tracking */
  async registerClient(accountId: string, client: Client): Promise<void> {
    console.log(`🛰️ Tracking connectivity for: ${accountId}`);

    // Initialize state safely
    const state = await this.safeGetConnectionState(client);
    this.clientStates.set(accountId, state);
    this.lastChangeTime.set(accountId, Date.now());
    console.log(`🔋 [${accountId}] Initial status: ${state}`);

    // Listen for real-time state changes
    client.onStateChanged((state) => {
      const prev = this.clientStates.get(accountId);
      if (prev !== state) this.updateState(accountId, state, prev, "stateChange");
    });

    // Logout listener (if supported)
    if (typeof client.onLogout === "function") {
      client.onLogout(() => {
        const prev = this.clientStates.get(accountId);
        this.updateState(accountId, "LOGGED_OUT", prev, "logout");
        this.cleanupSession(accountId); // 🧹 remove files on logout
      });
    }

    // Start watchdog poller
    const watchdog = this.startWatchdog(accountId, client);
    this.watchdogs.set(accountId, watchdog);
  }

  /** 🧱 Safe wrapper for getConnectionState() */
  private async safeGetConnectionState(client: Client): Promise<STATE | "ERROR"> {
    try {
      const state = await client.getConnectionState();
      return state || "ERROR";
    } catch (err: any) {
      const msg = err?.message || String(err);
      const knownIssues = [
        "Execution context was destroyed",
        "Target closed",
        "Cannot find context",
        "Cannot read properties of undefined",
        "Protocol error",
      ];
      if (knownIssues.some((k) => msg.includes(k))) {
        console.warn(`⚠️ Safe state fetch failed (page lost): ${msg}`);
        return "ERROR";
      }
      console.warn(`⚠️ Unexpected getConnectionState error:`, msg);
      return "ERROR";
    }
  }

  /** Update internal state + emit lifecycle events */
  private updateState(accountId: string, state: string, prev?: string, source?: string) {
    const now = Date.now();
    const uptime = this.lastChangeTime.has(accountId)
      ? (now - (this.lastChangeTime.get(accountId) ?? 0)) / 1000
      : 0;

    this.clientStates.set(accountId, state);
    this.lastChangeTime.set(accountId, now);

    console.log(`⚙️ [${accountId}] (${source}) ${prev ?? "N/A"} ➜ ${state} (${uptime.toFixed(1)}s)`);

    this.emit("stateChanged", { accountId, state, prev, uptime, source });

    switch (state) {
      case STATE.CONNECTED:
        this.emit("connected", { accountId });
        break;
      case STATE.DISCONNECTED:
      case STATE.CONFLICT:
      case STATE.TIMEOUT:
        this.emit("disconnected", { accountId });
        break;
      case STATE.UNPAIRED:
      case STATE.UNPAIRED_IDLE:
        this.emit("unlinked", { accountId });
        break;
      case "LOGGED_OUT":
      case "ERROR":
        this.emit("loggedOut", { accountId });
        this.cleanupSession(accountId); // 🧹 auto-clean on logout
        break;
      default:
        this.emit("unknownState", { accountId, state });
    }
  }

  /** 🐶 Watchdog to detect missed transitions */
  private startWatchdog(accountId: string, client: Client) {
    console.log(`⏱️ [${accountId}] Watchdog started`);
    const interval = setInterval(async () => {
      const current = await this.safeGetConnectionState(client);
      const prev = this.clientStates.get(accountId);

      if (current === "ERROR") {
        console.warn(`🚪 [${accountId}] Lost browser context – marking as LOGGED_OUT`);
        this.updateState(accountId, "LOGGED_OUT", prev, "watchdog");
        this.stopWatchdog(accountId);
        return;
      }

      if (current !== prev) {
        this.updateState(accountId, current, prev, "watchdog");
      }

      if (
        ["DISCONNECTED", "UNPAIRED", "UNPAIRED_IDLE"].includes(current) &&
        Date.now() - (this.lastChangeTime.get(accountId) ?? 0) > 20000
      ) {
        this.emit("unlinked", { accountId, since: 20 });
        this.updateState(accountId, "LOGGED_OUT", current, "watchdog-timeout");
        this.cleanupSession(accountId);
      }
    }, 2000);

    return interval;
  }

  /** Stop watchdog and cleanup */
  private stopWatchdog(accountId: string) {
    const wd = this.watchdogs.get(accountId);
    if (wd) clearInterval(wd);
    this.watchdogs.delete(accountId);
  }

  /** 🧹 Clean up session files and folder */
  async cleanupSession(accountId: string) {
    console.log(`🧹 [${accountId}] Cleaning up session files...`);

    try {
      // --- 1️⃣ Delete the session folder ---
      const sessionFolder = path.join(this.sessionDir, `WA_Session_${accountId}`);
      if (fs.existsSync(sessionFolder)) {
        fs.rmSync(sessionFolder, { recursive: true, force: true });
        console.log(`📁 Removed folder: ${sessionFolder}`);
      }

      // --- 2️⃣ Remove record from sessions.json (only if it exists) ---
      const sessionsFile = path.join(this.sessionDir, "sessions.json");

      if (fs.existsSync(sessionsFile)) {
        try {
          const data = fs.readFileSync(sessionsFile, "utf8");
          if (data.trim() === '[]' || data.trim() === '') {
            console.log(`⚠️ sessions.json is empty, skipping cleanup`);
            return;
          }

          const sessions = JSON.parse(data);
          if (!Array.isArray(sessions)) {
            console.warn(`⚠️ sessions.json contains invalid data, recreating`);
            fs.writeFileSync(sessionsFile, JSON.stringify([], null, 2));
            return;
          }

          const originalLength = sessions.length;
          const updated = sessions.filter(
            (s: any) =>
              s.id !== accountId &&
              s.data?.sessionId !== accountId
          );

          if (updated.length !== originalLength) {
            fs.writeFileSync(sessionsFile, JSON.stringify(updated, null, 2));
            console.log(`🗑️ Removed session entry for ${accountId} from sessions.json (${originalLength} → ${updated.length})`);
          } else {
            console.log(`ℹ️ No session entry found for ${accountId} in sessions.json`);
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse sessions.json, recreating:`, parseError);
          fs.writeFileSync(sessionsFile, JSON.stringify([], null, 2));
        }
      } else {
        console.log(`ℹ️ sessions.json not found at ${sessionsFile}`);
      }

      const account = await DatabaseService.getAccountBySessionId(accountId);
      console.log("Account:", account)
      const displayName = account.name
      console.log("Account Name:", displayName)

      try {
        console.log("Account Id::",accountId)
        const deleted = await DatabaseService.deleteAccountBySessionId(accountId);
        if (deleted) {
          console.log(`🧾 Removed account ${accountId} from database`);
        } else {
          console.warn(`⚠️ No DB record found for ${accountId}`);
        }
      } catch (dbErr) {
        console.error(`❌ Failed to delete account ${accountId} from DB:`, dbErr);
      }


      try {
          websocketService.emit("wa:logout", {
            sessionId: accountId,
            displayName,
            reason: "LOGGED_OUT",
            at: new Date().toISOString(),
          });
    
          console.log(`📡 Emitted 'wa:logout' for ${accountId} via websocketService`);
        } catch (emitErr) {
          console.error(`❌ Failed to emit wa:logout event:`, emitErr);
        }
    
        console.log(`✅ [${accountId}] Cleanup completed successfully.`);
      } catch (err) {
        console.error(`❌ Error cleaning up session ${accountId}:`, err);
      }
  }

  /** Remove client tracking */
  unregisterClient(accountId: string): void {
    console.log(`🔌 Stop tracking: ${accountId}`);
    this.stopWatchdog(accountId);
    this.clientStates.delete(accountId);
    this.lastChangeTime.delete(accountId);
  }

  getClientState(accountId: string): string | undefined {
    return this.clientStates.get(accountId);
  }

  getAllStates() {
    return Array.from(this.clientStates.entries()).map(([id, state]) => ({
      accountId: id,
      state,
      lastChangeTime: this.lastChangeTime.get(id),
    }));
  }

  getSummary() {
    const counts = { connected: 0, loggedOut: 0, disconnected: 0, total: 0 };
    for (const state of this.clientStates.values()) {
      counts.total++;
      if (state === STATE.CONNECTED) counts.connected++;
      else if (state === "LOGGED_OUT") counts.loggedOut++;
      else counts.disconnected++;
    }
    return counts;
  }
}

export const waConnectivityTracker = new WaConnectivityTracker();
