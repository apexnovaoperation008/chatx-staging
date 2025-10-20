import QRCode from "qrcode";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";

// 简化版WhatsApp服务，避免复杂的浏览器问题
type WaState = "QR_WAITING" | "QR_SCANNED" | "READY";
const sessions = new Map<string, { status: WaState; qrData?: string; startTime: number }>();

export async function getWaQrSimple(sessionId: string): Promise<string> {
  console.log(`🔍 简化版获取WhatsApp QR码: ${sessionId}`);
  
  let session = sessions.get(sessionId);
  
  if (!session) {
    // 创建新会话
    session = {
      status: "QR_WAITING",
      startTime: Date.now()
    };
    sessions.set(sessionId, session);
    
    // 生成模拟的WhatsApp QR码
    try {
      const qrData = `whatsapp-web-login-${sessionId}-${Date.now()}`;
      const qrImage = await QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      session.qrData = qrImage;
      session.status = "QR_WAITING";
      
      console.log(`✅ 简化版WhatsApp QR码已生成: ${sessionId}`);
      
      // 模拟15秒后连接成功
      setTimeout(() => {
        const currentSession = sessions.get(sessionId);
        if (currentSession && currentSession.status === "QR_WAITING") {
          currentSession.status = "READY";
          // 🔑 使用_IGNORE_前缀的ID
          const actualSessionId = `_IGNORE_${sessionId}`;
          
          WhatsAppSessionsStore.add({
            id: actualSessionId,
            provider: "whatsapp",
            label: `WhatsApp ${sessionId}`,
            data: { 
              sessionId: actualSessionId,
              dataDir: `sessions` // sessions根目录
            },
            createdAt: Date.now()
          });
          console.log(`✅ 简化版WhatsApp模拟连接成功: ${sessionId}`);
        }
      }, 15000);
      
    } catch (error) {
      console.error(`❌ 简化版WhatsApp QR生成失败: ${sessionId}`, error);
      throw error;
    }
  }
  
  return session.qrData || "";
}

export async function getWaStatusSimple(sessionId: string): Promise<WaState> {
  const session = sessions.get(sessionId);
  return session?.status || "QR_WAITING";
}
