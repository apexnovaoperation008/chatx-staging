"use client";
import { useEffect, useRef, useState } from "react";
import { WaApi, TgApi } from "@/lib/api";
import { WaSessionApi, SessionState } from "@/lib/wa-session-api";
// 如你已有 qrcode 组件，换成你的；否则先用这个
import { QRCodeSVG } from "qrcode.react";

type Provider = "whatsapp" | "telegram";
type TgMode = "qr" | "phone";

export default function ConnectModal({
  open,
  onClose,
  onConnected, // 成功后回调（比如刷新会话列表 / 关闭弹窗）
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: (provider: Provider) => void;
}) {
  const [provider, setProvider] = useState<Provider>("whatsapp");
  const [status, setStatus] = useState("INIT");

  // ---- WhatsApp (修复状态同步) ----
  const [waSessionId, setWaSessionId] = useState<string | null>(null);
  const [waSessionState, setWaSessionState] = useState<SessionState>('INIT');
  const [waQr, setWaQr] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null); // 当前轮询的会话ID
  const waPollRef = useRef<NodeJS.Timeout | null>(null);

  async function onWaGenerate() {
    console.log("🆕 WhatsApp QR生成流程 v3.0 - 完整hash Session管理");
    setStatus("QR_WAITING");
    setWaQr(null);
    
    try {
      // 步骤1: 检查服务端已连接会话
      console.log("📋 步骤1: 检查服务端已连接会话");
      await checkExistingConnections();
      if (status === "READY") {
        console.log("✅ 发现已连接会话，跳过QR生成");
        return;
      }
      
      // 步骤2: 创建新的hash Session ID（关键！）
      console.log("📋 步骤2: 创建新hash Session ID");
      const { sessionId: hashSessionId } = await WaApi.createSession();
      console.log("🎲 服务端生成hash Session ID:", hashSessionId);
      
      // 步骤3: 设置前端Session ID为hash值
      setCurrentSessionId(hashSessionId);
      console.log("📌 前端Session ID已设置为:", hashSessionId);
      
      // 步骤4: 使用hash Session ID请求QR码（触发open-wa初始化）
      console.log("📋 步骤4: 使用hash Session ID请求QR码");
      const { dataUrl } = await WaApi.getQr(hashSessionId);
      console.log("📱 QR码数据:", dataUrl ? `有数据(${dataUrl.length}字符)` : "无数据");
      setWaQr(dataUrl);
      
      // 步骤5: 开始轮询状态（使用hash Session ID）
      console.log("📋 步骤5: 开始状态轮询，Session ID:", hashSessionId);
      startStatusPolling(hashSessionId);
    } catch (e: any) {
      setStatus("ERROR");
      alert(`生成二维码失败：${e.message || e}`);
    }
  }

  // 独立的状态轮询函数
  function startStatusPolling(sessionId: string) {
    console.log("🔵 开始轮询会话状态:", sessionId);
    
    // 清除之前的轮询
    waPollRef.current && clearInterval(waPollRef.current);
    
    waPollRef.current = setInterval(async () => {
      try {
        console.log("🔍 轮询状态中...", sessionId);
        const { status } = await WaApi.getStatus(sessionId);
        console.log("📊 当前状态:", status);
        
        if (status === "READY") {
          console.log("✅ 检测到登录完成！");
          setStatus("READY");
          waPollRef.current && clearInterval(waPollRef.current);
          
          // 隐藏QR码，显示成功状态
          setWaQr(null);
          
          // 触发连接完成回调
          onConnected?.("whatsapp");
        } else if (status === "QR_SCANNED") {
          console.log("📱 QR码已扫描，等待确认...");
          setStatus("QR_SCANNED");
        } else if (status === "QR_WAITING") {
          setStatus("QR_WAITING");
        } else {
          console.log("⚠️ 未知状态:", status);
        }
      } catch (e) {
        console.error("❌ 轮询状态失败:", e);
      }
    }, 1500); // 更频繁的轮询以更快检测状态变化
  }

  // 处理添加账号
  async function handleAddAccount() {
    if (status !== "READY") {
      alert("请先完成连接后再添加账号");
      return;
    }

    if (!currentSessionId) {
      alert("会话ID不存在，无法添加账号");
      return;
    }

    try {
      console.log("🔵 正在添加账号...", currentSessionId);
      
      // 这里可以调用后端API保存账号信息
      // 暂时用模拟的成功响应
      const displayName = "Main Normal"; // 从表单获取或生成默认名称
      
      // 显示成功消息
      alert(`✅ 完成添加账号 - ${displayName}`);
      
      // 关闭弹窗
      onClose();
      
      // 通知父组件账号已添加
      onConnected?.(provider);
      
      console.log("✅ 账号添加成功");
    } catch (error) {
      console.error("❌ 添加账号失败:", error);
      alert("添加账号失败，请重试");
    }
  }

  // 弹窗打开时自动检查已连接的会话
  useEffect(() => {
    if (open && provider === "whatsapp") {
      console.log("🔍 弹窗打开，自动检查已连接的WhatsApp会话");
      checkExistingConnections();
    }
    return () => { waPollRef.current && clearInterval(waPollRef.current); };
  }, [open, provider]);

  // 检查现有连接的函数
  async function checkExistingConnections() {
    console.log(`🔍 检查已连接的WhatsApp会话...`);
    
    try {
      // 使用新的API获取所有已连接的会话
      const { sessions } = await WaApi.getConnectedSessions();
      console.log(`📊 服务端已连接会话:`, sessions);
      
      if (sessions && sessions.length > 0) {
        // 使用第一个已连接的会话
        const connectedSession = sessions[0];
        console.log(`✅ 发现已连接的会话: ${connectedSession.sessionId}`);
        setCurrentSessionId(connectedSession.sessionId);
        setStatus("READY");
        setWaQr(null);
        return;
      }
    } catch (error) {
      console.log(`⚠️ 获取已连接会话失败:`, error);
    }
    
    console.log(`ℹ️ 没有发现已连接的会话，准备生成新的`);
  }

  // ---- Telegram ----
  const [tgMode, setTgMode] = useState<TgMode>("qr");
  const [tgLoginKey, setTgLoginKey] = useState<string | null>(null);
  const [tgQrPayload, setTgQrPayload] = useState<string | null>(null);
  const tgPollRef = useRef<NodeJS.Timeout | null>(null);

  async function onTgStartQr() {
    setStatus("QR_WAITING");
    setTgQrPayload(null);
    try {
      const { loginKey, qrPayload } = await TgApi.startQr();
      setTgLoginKey(loginKey);
      setTgQrPayload(qrPayload);
      // 轮询授权结果
      tgPollRef.current && clearInterval(tgPollRef.current);
      tgPollRef.current = setInterval(async () => {
        try {
          if (!loginKey) return;
          const res = await TgApi.poll(loginKey);
          if (res.ok) {
            setStatus("READY");
            tgPollRef.current && clearInterval(tgPollRef.current);
            onConnected?.("telegram");
          } else {
            setStatus("QR_WAITING");
          }
        } catch (e) { console.error(e); }
      }, 1500);
    } catch (e: any) {
      setStatus("ERROR");
      alert(`生成二维码失败：${e.message || e}`);
    }
  }

  useEffect(() => {
    return () => { tgPollRef.current && clearInterval(tgPollRef.current); };
  }, []);

  // 手机号流
  const [phone, setPhone] = useState("");
  const [txId, setTxId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  async function onTgStartPhone() {
    try {
      const { txId } = await TgApi.startPhone(phone);
      setTxId(txId);
      setStatus("CODE_SENT");
    } catch (e: any) {
      setStatus("ERROR");
      alert(`发送验证码失败：${e.message || e}`);
    }
  }
  async function onTgVerifyPhone() {
    if (!txId) return;
    setStatus("VERIFYING");
    try {
      await TgApi.verifyPhone(txId, code, password || undefined);
      setStatus("READY");
      onConnected?.("telegram");
    } catch (e: any) {
      setStatus("ERROR");
      alert(`验证失败：${e.message || e}`);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[720px] rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">添加新账号</h3>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>

        {/* Provider 选择 */}
        <div className="mb-4 flex gap-2">
          <button className={`px-3 py-1 rounded ${provider==='whatsapp'?'bg-green-100 text-green-800':'bg-gray-100'}`} onClick={()=>setProvider("whatsapp")}>WhatsApp</button>
          <button className={`px-3 py-1 rounded ${provider==='telegram'?'bg-blue-100 text-blue-800':'bg-gray-100'}`} onClick={()=>setProvider("telegram")}>Telegram</button>
        </div>

        {/* WhatsApp 区域 */}
        {provider === "whatsapp" && (
          <div className="rounded-lg border p-4">
            <div className="mb-2 text-gray-600">扫描二维码连接（请用手机 WhatsApp 的【设置→已关联装置】扫描）</div>
            <div className="flex items-center gap-6">
              <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-gray-50">
                {status === "READY" ? (
                  // 登录成功显示
                  <div className="flex flex-col items-center text-green-600">
                    <div className="text-6xl">✓</div>
                    <div className="mt-2 text-sm font-medium">连接成功</div>
                  </div>
                ) : waQr ? (
                  // 显示QR码
                  <img src={waQr} alt="WA QR" className="h-52 w-52" />
                ) : (
                  // 未生成状态
                  <span className="text-gray-400">尚未生成</span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  className="rounded bg-black px-4 py-2 text-white disabled:bg-gray-400" 
                  onClick={onWaGenerate}
                  disabled={status === "READY"}
                >
                  {status === "READY" ? "已连接" : "生成二维码"}
                </button>
                <button 
                  className="rounded bg-blue-600 px-2 py-1 text-white text-xs" 
                  onClick={checkExistingConnections}
                >
                  检查连接
                </button>
                <div className="text-sm text-gray-500">
                  状态：
                  {status === "READY" && "✅ 已连接"}
                  {status === "QR_SCANNED" && "📱 已扫描，等待确认"}
                  {status === "QR_WAITING" && "⏳ 等待扫描"}
                  {status === "INIT" && "⚪ 初始状态"}
                  {status === "ERROR" && "❌ 连接失败"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Telegram 区域 */}
        {provider === "telegram" && (
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex gap-2">
              <button className={`px-3 py-1 rounded ${tgMode==='qr'?'bg-blue-100 text-blue-800':'bg-gray-100'}`} onClick={()=>setTgMode("qr")}>扫码登录</button>
              <button className={`px-3 py-1 rounded ${tgMode==='phone'?'bg-blue-100 text-blue-800':'bg-gray-100'}`} onClick={()=>setTgMode("phone")}>手机号登录</button>
            </div>

            {tgMode === "qr" ? (
              <div className="flex items-center gap-6">
                <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-gray-50">
                  {tgQrPayload ? <QRCodeSVG value={tgQrPayload} size={208} /> : <span className="text-gray-400">尚未生成</span>}
                </div>
                <div className="flex flex-col gap-3">
                  <button className="rounded bg-black px-4 py-2 text-white" onClick={onTgStartQr}>生成二维码</button>
                  <div className="text-sm text-gray-500">请在 Telegram App【设置→设备】里选择"扫描二维码"。</div>
                  <div className="text-sm text-gray-500">状态：{status}</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {!txId ? (
                  <>
                    <input className="w-80 rounded border px-3 py-2" placeholder="+60..." value={phone} onChange={(e)=>setPhone(e.target.value)} />
                    <button className="w-40 rounded bg-black px-4 py-2 text-white" onClick={onTgStartPhone}>发送验证码</button>
                  </>
                ) : (
                  <>
                    <input className="w-80 rounded border px-3 py-2" placeholder="验证码" value={code} onChange={(e)=>setCode(e.target.value)} />
                    <input className="w-80 rounded border px-3 py-2" placeholder="2FA 密码（如有）" value={password} onChange={(e)=>setPassword(e.target.value)} />
                    <button className="w-40 rounded bg-black px-4 py-2 text-white" onClick={onTgVerifyPhone}>确认登录</button>
                  </>
                )}
                <div className="text-sm text-gray-500">状态：{status}</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button className="rounded border px-4 py-2" onClick={onClose}>取消</button>
          <button 
            className="rounded bg-green-600 px-4 py-2 text-white disabled:bg-gray-400 disabled:cursor-not-allowed" 
            onClick={handleAddAccount}
            disabled={status !== "READY"}
          >
            {status === "READY" ? "添加" : "添加（请先完成连接）"}
          </button>
        </div>
      </div>
    </div>
  );
}