import fs from "fs";
import path from "path";

export type TelegramSessRow = {
  id: string;                 // sessionId/loginKey/txId
  provider: "telegram";
  label?: string;    
  data: {
    session: string;    
    name?:string;       // Telegram session字符串
    description?: string;  
    phone?: string;            // 手机号（如果通过手机号登录）
    username?: string;         // 添加用户名字段
    firstName?: string;        // 添加名字字段
    lastName?: string;         // 添加姓氏字段
    isActive?: boolean;        // 添加启用状态字段
    workspace_id?:number;
    brand_id?:number;
  };
  createdAt: number;
  createdBy?:number;
};

const dbFile = path.resolve(process.cwd(), "data", "sessions.json");
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

function read(): TelegramSessRow[] { 
  try { 
    const allSessions = JSON.parse(fs.readFileSync(dbFile,"utf8")); 
    // Filter to only return Telegram sessions
    return allSessions.filter((session: any) => session.provider === "telegram");
  } catch { 
    return []; 
  } 
}

function write(rows: TelegramSessRow[]) { 
  try {
    // Read all sessions first to preserve other providers
    const allSessions = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    
    // Remove existing Telegram sessions
    const filteredSessions = allSessions.filter((session: any) => session.provider !== "telegram");
    
    // Add new Telegram sessions
    const updatedSessions = [...filteredSessions, ...rows];
    
    fs.writeFileSync(dbFile, JSON.stringify(updatedSessions, null, 2)); 
  } catch (error) {
    // If file doesn't exist or is invalid, just write the Telegram sessions
    fs.writeFileSync(dbFile, JSON.stringify(rows, null, 2)); 
  }
}

export const TelegramSessionsStore = {
  list(): TelegramSessRow[] { 
    return read(); 
  },
  
  add(row: TelegramSessRow) { 
    const rows = read(); 
    // 检查是否已存在，如果存在则更新
    const existingIndex = rows.findIndex(r => r.id === row.id);
    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
    } else {
      rows.push(row); 
    }
    write(rows); 
    console.log(`✅ Telegram会话已保存: ${row.id}`);
  },
  
  remove(id: string) { 
    const rows = read();
    const filteredRows = rows.filter(r => r.id !== id);
    write(filteredRows); 
    console.log(`🗑️ Telegram会话已删除: ${id}`);
  },
  
  get(id: string): TelegramSessRow | null {
    const rows = read();
    return rows.find(r => r.id === id) || null;
  },
  
  update(id: string, updates: Partial<TelegramSessRow>) {
    const rows = read();
    const index = rows.findIndex(r => r.id === id);
    if (index >= 0) {
      rows[index] = { ...rows[index], ...updates };
      write(rows);
      console.log(`✅ Telegram会话已更新: ${id}`);
      return true;
    }
    return false;
  }
};
