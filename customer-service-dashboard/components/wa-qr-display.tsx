/**
 * WhatsApp QR码显示组件
 * 状态机驱动的QR码展示和轮询逻辑
 */

"use client"

import * as React from "react"
import { Loader2, RefreshCw, AlertCircle, CheckCircle, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/contexts/language-context"
import { 
  WaSessionApi, 
  SessionInfo, 
  getStateDisplayText,
  SessionState
} from "@/lib/wa-session-api"

interface WaQRDisplayProps {
  session: SessionInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionUpdate?: (session: SessionInfo) => void;
}

export function WaQRDisplay({ session, open, onOpenChange, onSessionUpdate }: WaQRDisplayProps) {
  const { t, language } = useLanguage()
  const [qrData, setQrData] = React.useState<string | null>(null)
  const [sessionState, setSessionState] = React.useState<SessionState | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [expiresAt, setExpiresAt] = React.useState<number | null>(null)
  const [timeLeft, setTimeLeft] = React.useState<number>(0)
  
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null)
  const countdownRef = React.useRef<NodeJS.Timeout | null>(null)

  // 清理定时器
  const clearTimers = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  // 加载QR码
  const loadQR = React.useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true)
      setError(null)
      
      // 获取会话信息
      const sessionInfo = await WaSessionApi.getSession(sessionId)
      setSessionState(sessionInfo.state)
      onSessionUpdate?.(sessionInfo)

      // 如果已连接，停止加载QR
      if (sessionInfo.state === 'CONNECTED') {
        setQrData(null)
        clearTimers()
        return
      }

      // 如果状态不是QR_READY，清空QR数据
      if (sessionInfo.state !== 'QR_READY') {
        setQrData(null)
        return
      }

      // 获取QR码
      const qrResult = await WaSessionApi.getSessionQR(sessionId)
      if (qrResult) {
        setQrData(qrResult.qrData)
        setExpiresAt(qrResult.expiresAt)
        
        // 计算剩余时间
        const remaining = Math.max(0, Math.floor((qrResult.expiresAt - Date.now()) / 1000))
        setTimeLeft(remaining)
      } else {
        setQrData(null)
        setExpiresAt(null)
      }
    } catch (error: any) {
      console.error('加载QR码失败:', error)
      setError(error.message || '加载QR码失败')
      setQrData(null)
    } finally {
      setIsLoading(false)
    }
  }, [onSessionUpdate])

  // 启动轮询
  const startPolling = React.useCallback((sessionId: string) => {
    clearTimers()
    
    // 立即加载一次
    loadQR(sessionId)
    
    // 每2秒轮询状态
    intervalRef.current = setInterval(() => {
      loadQR(sessionId)
    }, 2000)
    
    // 倒计时更新
    countdownRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = Math.max(0, prev - 1)
        if (newTime === 0 && expiresAt) {
          // QR过期，重新加载
          loadQR(sessionId)
        }
        return newTime
      })
    }, 1000)
  }, [loadQR, expiresAt])

  // 监听session变化
  React.useEffect(() => {
    if (open && session) {
      startPolling(session.id)
    } else {
      clearTimers()
      setQrData(null)
      setSessionState(null)
      setError(null)
    }

    return clearTimers
  }, [open, session, startPolling, clearTimers])

  // 重新生成QR
  const handleRegenerateQR = async () => {
    if (!session) return

    try {
      setIsLoading(true)
      await WaSessionApi.regenerateQR(session.id)
      // 重新开始轮询
      startPolling(session.id)
    } catch (error: any) {
      setError(error.message || '重新生成QR失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 格式化倒计时
  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 获取状态徽章颜色
  const getStateBadgeColor = (state: SessionState) => {
    switch (state) {
      case 'CONNECTED':
        return 'bg-green-500'
      case 'FAILED':
        return 'bg-red-500'
      case 'AUTHENTICATING':
        return 'bg-blue-500'
      case 'QR_READY':
        return 'bg-orange-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (!session) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>WhatsApp 连接</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* 会话信息 */}
          <div className="text-center">
            <h3 className="font-medium mb-2">
              会话 ID: {session.id.slice(-8)}
            </h3>
            {sessionState && (
              <Badge className={`${getStateBadgeColor(sessionState)} text-white`}>
                {getStateDisplayText(sessionState, language as 'zh' | 'en')}
              </Badge>
            )}
          </div>

          {/* QR码显示区域 */}
          <Card>
            <CardContent className="p-6">
              {isLoading ? (
                <div className="text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin" />
                  <p className="text-sm text-muted-foreground">加载QR码中...</p>
                </div>
              ) : error ? (
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                  <p className="text-sm text-red-600 mb-4">{error}</p>
                  <Button variant="outline" onClick={handleRegenerateQR}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重试
                  </Button>
                </div>
              ) : sessionState === 'CONNECTED' ? (
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-green-600 font-medium">连接成功！</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    WhatsApp 账号已成功连接
                  </p>
                </div>
              ) : sessionState === 'AUTHENTICATING' ? (
                <div className="text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 text-blue-500 animate-spin" />
                  <p className="text-blue-600 font-medium">认证中...</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    请在手机上确认登录
                  </p>
                </div>
              ) : qrData ? (
                <div className="text-center">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 mb-4">
                    <img
                      src={qrData}
                      alt="WhatsApp QR Code"
                      className="w-full h-auto max-w-[200px] mx-auto"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    请使用 WhatsApp 手机客户端扫描二维码
                  </p>
                  {timeLeft > 0 && (
                    <p className="text-xs text-orange-600">
                      有效期: {formatTimeLeft(timeLeft)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {sessionState === 'FAILED' ? 'QR码生成失败' : 'QR码暂不可用'}
                  </p>
                  {sessionState === 'FAILED' && (
                    <Button variant="outline" onClick={handleRegenerateQR}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      重新生成
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 操作说明 */}
          {qrData && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. 打开 WhatsApp 手机客户端</p>
              <p>2. 进入 设置 → 已关联设备</p>
              <p>3. 点击 "关联设备" 扫描上方二维码</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
