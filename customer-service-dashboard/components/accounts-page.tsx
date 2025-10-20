"use client";
import { useEffect, useState } from "react";
import { SessionApi } from "@/lib/api";

export default function AccountsPage() {
  const [rows, setRows] = useState<Array<{
    id: string
    provider: string
    label?: string
    createdAt: string
    workspaceId?: number | null
    brandId?: number | null
  }>>([]);
  
  async function load() {
    try {
      const list = await SessionApi.list();
      setRows(list);
    } catch (e) {
      console.error("加载账号列表失败:", e);
    }
  }
  
  async function remove(id: string) {
    if (!confirm("确定删除该账号的连接吗？")) return;
    try {
      await SessionApi.remove(id);
      load();
    } catch (e) {
      console.error("删除账号失败:", e);
      alert("删除失败，请稍后重试");
    }
  }

  useEffect(()=>{ load(); }, []);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">已连接账号</h2>
        <button 
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
          onClick={load}
        >
          刷新
        </button>
      </div>
      
      <div className="rounded-lg border">
        <table className="w-full table-auto">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">渠道</th>
              <th className="px-4 py-3 text-left font-medium">备注</th>
              <th className="px-4 py-3 text-left font-medium">创建时间</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  暂无已连接账号
                </td>
              </tr>
            ) : (
              rows.map(r=>(
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{r.id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                      r.provider === 'whatsapp' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {r.provider === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.label || "-"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button 
                      className="text-red-600 hover:text-red-800 hover:underline"
                      onClick={()=>remove(r.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
