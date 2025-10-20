/**
 * WhatsApp 会话状态机测试页面
 * 用于测试和演示新的状态机功能
 */

"use client"

import * as React from "react"
import { WaSessionManager } from "@/components/wa-session-manager"
import { WaQRDisplay } from "@/components/wa-qr-display"
import { SessionInfo } from "@/lib/wa-session-api"

export default function TestWaSessionsPage() {
  const [selectedSession, setSelectedSession] = React.useState<SessionInfo | null>(null)
  const [isQRDialogOpen, setIsQRDialogOpen] = React.useState(false)

  const handleSessionSelected = (session: SessionInfo) => {
    setSelectedSession(session)
    setIsQRDialogOpen(true)
  }

  const handleSessionUpdate = (session: SessionInfo) => {
    setSelectedSession(session)
    
    // 如果会话已连接，自动关闭QR对话框
    if (session.state === 'CONNECTED') {
      setTimeout(() => {
        setIsQRDialogOpen(false)
      }, 2000) // 2秒后自动关闭
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">WhatsApp 会话状态机测试</h1>
        <p className="text-muted-foreground">
          测试和演示新的状态机驱动的WhatsApp会话管理功能
        </p>
      </div>

      {/* 会话管理器 */}
      <WaSessionManager onSessionSelected={handleSessionSelected} />

      {/* QR码显示对话框 */}
      <WaQRDisplay
        session={selectedSession}
        open={isQRDialogOpen}
        onOpenChange={setIsQRDialogOpen}
        onSessionUpdate={handleSessionUpdate}
      />
    </div>
  )
}
