"use client";
import { useState } from "react";

export default function TestPage() {
  const [result, setResult] = useState<string>("等待测试...");

  // 测试API连接
  async function testAPI() {
    console.log("🔵 开始API测试");
    setResult("测试中...");
    
    try {
      // 测试健康检查
      const healthResponse = await fetch("http://localhost:3001/health", {
        headers: {
          "Authorization": "Bearer dev-admin-token"
        }
      });
      
      if (!healthResponse.ok) {
        throw new Error(`健康检查失败: ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      console.log("✅ 健康检查成功:", healthData);
      
      // 测试WhatsApp API
      const waResponse = await fetch("http://localhost:3001/wa/login/qr?sessionId=test-123", {
        headers: {
          "Authorization": "Bearer dev-admin-token"
        }
      });
      
      if (!waResponse.ok) {
        throw new Error(`WhatsApp API失败: ${waResponse.status}`);
      }
      
      const waData = await waResponse.json();
      console.log("✅ WhatsApp API成功:", waData);
      
      setResult(`✅ 所有测试通过！
健康检查: ${healthData.service}
WhatsApp QR: ${waData.dataUrl ? '已生成' : '未生成'}
数据长度: ${waData.dataUrl?.length || 0} 字符`);
      
    } catch (error: any) {
      console.error("❌ 测试失败:", error);
      setResult(`❌ 测试失败: ${error.message}`);
    }
  }

  // 测试Telegram API
  async function testTelegram() {
    console.log("🔵 开始Telegram测试");
    setResult("测试Telegram中...");
    
    try {
      const response = await fetch("http://localhost:3001/tg/qr/start", {
        method: "POST",
        headers: {
          "Authorization": "Bearer dev-admin-token",
          "Content-Type": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`Telegram API失败: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("✅ Telegram API成功:", data);
      
      setResult(`✅ Telegram测试通过！
登录密钥: ${data.loginKey}
QR载荷: ${data.qrPayload}
载荷长度: ${data.qrPayload?.length || 0} 字符`);
      
    } catch (error: any) {
      console.error("❌ Telegram测试失败:", error);
      setResult(`❌ Telegram测试失败: ${error.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">API连接测试页面</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">测试结果</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm whitespace-pre-wrap">
            {result}
          </pre>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={testAPI}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
          >
            测试WhatsApp API
          </button>
          
          <button
            onClick={testTelegram}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium"
          >
            测试Telegram API
          </button>
          
          <button
            onClick={() => {
              setResult("手动清除结果");
              console.clear();
            }}
            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium"
          >
            清除结果
          </button>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">使用说明</h3>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• 打开开发者工具查看详细日志</li>
            <li>• 确保后端服务运行在 http://localhost:3001</li>
            <li>• 点击按钮测试各个API接口</li>
            <li>• 测试成功后返回主页面: <a href="/" className="underline">http://localhost:3000</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
