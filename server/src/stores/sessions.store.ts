import fs from "fs";
import path from "path";

export type SessRow = {
  id: string;                 // sessionId/loginKey/txId
  provider: "whatsapp"|"telegram";
  label?: string;
  data: any;                  // 路径/字符串/对象（生产请加密）
  createdAt: number;
};

const dbFile = path.resolve(process.cwd(), "sessions", "sessions.json");
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

function read(): SessRow[] { 
  try { 
    return JSON.parse(fs.readFileSync(dbFile,"utf8")); 
  } catch { 
    return []; 
  } 
}

function write(rows: SessRow[]) { 
  fs.writeFileSync(dbFile, JSON.stringify(rows, null, 2)); 
}

export const SessionsStore = {
  list(): SessRow[] { 
    return read(); 
  },
  
  add(row: SessRow) { 
    const rows = read(); 
    // 检查是否已存在，如果存在则更新
    const existingIndex = rows.findIndex(r => r.id === row.id);
    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
    } else {
      rows.push(row); 
    }
    write(rows); 
    console.log(`✅ 会话已保存: ${row.provider}/${row.id}`);
  },
  
  remove(id: string) { 
    const rows = read();
    const filteredRows = rows.filter(r => r.id !== id);
    write(filteredRows); 
    console.log(`🗑️ 会话已删除: ${id}`);
  },
  
  get(id: string): SessRow | null {
    const rows = read();
    return rows.find(r => r.id === id) || null;
  },
  
  update(id: string, updates: Partial<SessRow>) {
    const rows = read();
    const index = rows.findIndex(r => r.id === id);
    if (index >= 0) {
      rows[index] = { ...rows[index], ...updates };
      write(rows);
      console.log(`✅ 会话已更新: ${id}`);
      return true;
    }
    return false;
  }
};