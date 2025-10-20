/**
 * Debug endpoint for checking client status
 * Helps diagnose issues with WhatsApp and Telegram clients
 */

import { Router, Response } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { getAllReconnectedWaClients, getAllReconnectedTgClients } from "../services/startup-reconnect.service";
import { getAllWaClients } from "../services/wa-simple-final.service";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";

const r = Router();

/**
 * Debug: Check all WhatsApp clients status
 */
// @ts-ignore
r.get("/wa-clients", requireAdmin, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reconnectedClients = getAllReconnectedWaClients();
    const newClients = getAllWaClients();
    const storedAccounts = WhatsAppSessionsStore.list();
    
    const reconnectedStatus = [];
    for (const [accountId, client] of reconnectedClients.entries()) {
      try {
        const isConnected = await client.isConnected();
        reconnectedStatus.push({
          accountId,
          source: 'reconnected',
          isConnected,
          hasClient: true
        });
      } catch (error: any) {
        reconnectedStatus.push({
          accountId,
          source: 'reconnected',
          isConnected: false,
          hasClient: true,
          error: error.message
        });
      }
    }
    
    const newClientStatus = [];
    for (const [accountId, client] of newClients.entries()) {
      try {
        const isConnected = await client.isConnected();
        newClientStatus.push({
          accountId,
          source: 'wa-simple-final',
          isConnected,
          hasClient: true
        });
      } catch (error: any) {
        newClientStatus.push({
          accountId,
          source: 'wa-simple-final',
          isConnected: false,
          hasClient: true,
          error: error.message
        });
      }
    }
    
    const accountStatus = storedAccounts.map(acc => ({
      accountId: acc.id,
      label: acc.label,
      hasReconnectedClient: reconnectedClients.has(acc.id),
      hasNewClient: newClients.has(acc.id),
      sessionData: acc.data
    }));
    
    res.json({
      success: true,
      data: {
        summary: {
          totalStored: storedAccounts.length,
          totalReconnected: reconnectedClients.size,
          totalNew: newClients.size,
          totalUnique: new Set([...reconnectedClients.keys(), ...newClients.keys()]).size
        },
        storedAccounts: accountStatus,
        reconnectedClients: reconnectedStatus,
        newClients: newClientStatus,
        allClientIds: {
          reconnected: Array.from(reconnectedClients.keys()),
          new: Array.from(newClients.keys()),
          stored: storedAccounts.map(a => a.id)
        }
      }
    });
  } catch (error: any) {
    console.error("❌ Debug: 检查WhatsApp客户端失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "检查客户端失败"
    });
  }
}) as any);

/**
 * Debug: Check all Telegram clients status
 */
// @ts-ignore
r.get("/tg-clients", requireAdmin, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reconnectedClients = getAllReconnectedTgClients();
    const storedAccounts = TelegramSessionsStore.list();
    
    const clientStatus = [];
    for (const [accountId, client] of reconnectedClients.entries()) {
      try {
        const me = await client.getMe();
        clientStatus.push({
          accountId,
          isConnected: !!me,
          hasClient: true,
          username: (me as any)?.username,
          firstName: (me as any)?.firstName
        });
      } catch (error: any) {
        clientStatus.push({
          accountId,
          isConnected: false,
          hasClient: true,
          error: error.message
        });
      }
    }
    
    const accountStatus = storedAccounts.map(acc => ({
      accountId: acc.id,
      label: acc.label,
      hasClient: reconnectedClients.has(acc.id),
      sessionData: acc.data
    }));
    
    res.json({
      success: true,
      data: {
        summary: {
          totalStored: storedAccounts.length,
          totalReconnected: reconnectedClients.size
        },
        storedAccounts: accountStatus,
        reconnectedClients: clientStatus,
        allClientIds: {
          reconnected: Array.from(reconnectedClients.keys()),
          stored: storedAccounts.map(a => a.id)
        }
      }
    });
  } catch (error: any) {
    console.error("❌ Debug: 检查Telegram客户端失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "检查客户端失败"
    });
  }
}) as any);

/**
 * Debug: Get detailed info for a specific WhatsApp account
 */
// @ts-ignore
r.get("/wa-clients/:accountId", requireAdmin, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    
    const reconnectedClients = getAllReconnectedWaClients();
    const newClients = getAllWaClients();
    
    const reconnectedClient = reconnectedClients.get(accountId);
    const newClient = newClients.get(accountId);
    
    let reconnectedInfo = null;
    let newClientInfo = null;
    
    if (reconnectedClient) {
      try {
        const isConnected = await reconnectedClient.isConnected();
        const me = isConnected ? await reconnectedClient.getMe() : null;
        reconnectedInfo = {
          exists: true,
          isConnected,
          phoneNumber: me ? (me as any)._serialized?.split('@')[0] : null,
          pushname: (me as any)?.pushname
        };
      } catch (error: any) {
        reconnectedInfo = {
          exists: true,
          error: error.message
        };
      }
    }
    
    if (newClient) {
      try {
        const isConnected = await newClient.isConnected();
        const me = isConnected ? await newClient.getMe() : null;
        newClientInfo = {
          exists: true,
          isConnected,
          phoneNumber: me ? (me as any)._serialized?.split('@')[0] : null,
          pushname: (me as any)?.pushname
        };
      } catch (error: any) {
        newClientInfo = {
          exists: true,
          error: error.message
        };
      }
    }
    
    res.json({
      success: true,
      data: {
        accountId,
        reconnectedClient: reconnectedInfo || { exists: false },
        newClient: newClientInfo || { exists: false },
        recommendation: !reconnectedInfo && !newClientInfo 
          ? "Client not found. May need to reconnect or login again."
          : reconnectedInfo?.isConnected || newClientInfo?.isConnected
          ? "Client is connected and ready."
          : "Client exists but not connected."
      }
    });
  } catch (error: any) {
    console.error("❌ Debug: 获取账号详情失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取账号详情失败"
    });
  }
}) as any);

export default r;

