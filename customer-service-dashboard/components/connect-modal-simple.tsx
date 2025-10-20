"use client";
import { useState } from "react";
import { useLanguage } from "@/contexts/language-context";

export default function ConnectModalSimple({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: (provider: string) => void;
}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("INIT");

  // 测试函数
  function testClick() {
    console.log("🔵 测试点击事件 - 正常工作!");
    alert("点击事件正常工作！");
    setStatus("CLICKED");
  }

  // 测试API调用
  async function testAPI() {
    console.log("🔵 测试API调用开始");
    try {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE as string
    const response = await fetch(`${API_BASE}/health`, {
        headers: {
          "Authorization": "Bearer dev-admin-token"
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ API调用成功:", data);
        alert("API连接正常！");
        setStatus("API_OK");
      } else {
        console.error("❌ API响应错误:", response.status);
        alert(`API错误: ${response.status}`);
        setStatus("API_ERROR");
      }
    } catch (error) {
      console.error("❌ API调用失败:", error);
      alert(`API调用失败: ${error}`);
      setStatus("API_FAILED");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="w-[500px] rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">{t('test.connection_test')}</h3>
          <button className="text-gray-500 text-2xl" onClick={onClose}>×</button>
        </div>

        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            {t('test.current_status')}: <span className="font-mono">{status}</span>
          </div>

          <div className="space-y-2">
            <button 
              className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              onClick={testClick}
            >
              {t('test.test_click')}
            </button>

            <button 
              className="w-full rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              onClick={testAPI}
            >
              {t('test.test_api_connection')}
            </button>

            <button 
              className="w-full rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
              onClick={() => {
                console.log("🔵 关闭弹窗");
                onClose();
              }}
            >
              {t('common.close')}
            </button>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
            <div>{t('test.open_console_for_logs')}</div>
            <div>前端: http://localhost:3000</div>
          <div>后端: {process.env.NEXT_PUBLIC_API_BASE}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
