import fs from "fs";
import path from "path";

export type WhatsAppSessRow = {
  id: string;                 // sessionId/instanceId
  provider: "whatsapp";
  label?: string;
  description?: string;       // 添加描述字段
  data: {
    sessionId: string;
    dataDir: string;
    phoneNumber?: string;     // 添加手机号字段
    isActive?: boolean;        // 添加启用状态字段
    pushname?: string;      // 添加pushname字段    
    workspaceId?: number;
    brandId?: number;  
  };
  createdAt: number;
  createdBy?: number;
};

const dbFile = path.resolve(process.cwd(), "sessions", "sessions.json");
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

function read(): WhatsAppSessRow[] { 
  try { 
    const allSessions = JSON.parse(fs.readFileSync(dbFile,"utf8")); 
    // Filter to only return WhatsApp sessions
    return allSessions.filter((session: any) => session.provider === "whatsapp");
  } catch { 
    return []; 
  } 
}

function write(rows: WhatsAppSessRow[]) { 
  try {
    // Read all sessions first to preserve other providers
    const allSessions = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    
    // Remove existing WhatsApp sessions
    const filteredSessions = allSessions.filter((session: any) => session.provider !== "whatsapp");
    
    // Add new WhatsApp sessions
    const updatedSessions = [...filteredSessions, ...rows];
    
    fs.writeFileSync(dbFile, JSON.stringify(updatedSessions, null, 2)); 
  } catch (error) {
    // If file doesn't exist or is invalid, just write the WhatsApp sessions
    fs.writeFileSync(dbFile, JSON.stringify(rows, null, 2)); 
  }
}

export const WhatsAppSessionsStore = {
  list(): WhatsAppSessRow[] { 
    return read(); 
  },
  
  add(row: WhatsAppSessRow) { 
    const rows = read(); 
    // 检查是否已存在，如果存在则更新
    const existingIndex = rows.findIndex(r => r.id === row.id);
    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
    } else {
      rows.push(row); 
    }
    write(rows); 
    console.log(`✅ WhatsApp会话已保存: ${row.id}`);
  },
  
  remove(id: string) { 
    const rows = read();
    const filteredRows = rows.filter(r => r.id !== id);
    write(filteredRows); 
    console.log(`🗑️ WhatsApp会话已删除: ${id}`);
  },
  
  get(id: string): WhatsAppSessRow | null {
    const rows = read();
    return rows.find(r => r.id === id) || null;
  },
  
  update(id: string, updates: Partial<WhatsAppSessRow>) {
    const rows = read();
    const index = rows.findIndex(r => r.id === id);
    if (index >= 0) {
      rows[index] = { ...rows[index], ...updates };
      write(rows);
      console.log(`✅ WhatsApp会话已更新: ${id}`);
      return true;
    }
    return false;
  }
};
