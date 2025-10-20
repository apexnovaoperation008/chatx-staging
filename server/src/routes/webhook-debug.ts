/**
 * Webhook 调试 API
 */

import { Router } from "express";
import { getAllReconnectedTgClients } from "../services/startup-reconnect.service";

const r = Router();

// 获取当前连接的账号信息
r.get("/accounts", async (req, res) => {
  try {
    const clients = getAllReconnectedTgClients();
    const accounts = [];

    for (const [accountId, client] of clients) {
      try {
        const me = await client.getMe();
        accounts.push({
          accountId,
          userId: me.id,
          firstName: me.firstName,
          username: me.username,
          phone: me.phone,
          isConnected: true
        });
      } catch (error: any) {
        accounts.push({
          accountId,
          isConnected: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalAccounts: clients.size,
        accounts: accounts
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取 WebSocket 连接状态
r.get("/websocket-status", (req, res) => {
  res.json({
    success: true,
    data: {
      message: "WebSocket 服务正在运行",
      timestamp: new Date().toISOString()
    }
  });
});

// 获取客户端存储状态
r.get("/client-status", (req, res) => {
  try {
    const { getAllReconnectedTgClients, getAllReconnectedWaClients } = require("../services/startup-reconnect.service");
    
    const tgClients = getAllReconnectedTgClients();
    const waClients = getAllReconnectedWaClients();
    
    res.json({
      success: true,
      data: {
        telegram: {
          count: tgClients.size,
          clients: Array.from(tgClients.keys())
        },
        whatsapp: {
          count: waClients.size,
          clients: Array.from(waClients.keys())
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default r;

