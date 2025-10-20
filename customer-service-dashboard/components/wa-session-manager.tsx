/**
 * WhatsApp 会话管理组件
 * 实现状态机驱动的会话管理界面
 */

"use client"

import * as React from "react"
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Smartphone, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  QrCode,
  Power
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useLanguage } from "@/contexts/language-context"
import { 
  WaSessionApi, 
  SessionInfo, 
  SessionStats, 
  getStateDisplayText, 
  STATE_PERMISSIONS,
  SessionState
} from "@/lib/wa-session-api"

interface WaSessionManagerProps {
  onSessionSelected?: (session: SessionInfo) => void;
}

export function WaSessionManager({ onSessionSelected }: WaSessionManagerProps) {
  const { t, language } = useLanguage()
  const [sessions, setSessions] = React.useState<SessionInfo[]>([])
  const [stats, setStats] = React.useState<SessionStats>({
    total: 0,
    connected: 0,
    byState: { INIT: 0, QR_READY: 0, AUTHENTICATING: 0, CONNECTED: 0, FAILED: 0, DISCONNECTED: 0 }
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [isCreatingSession, setIsCreatingSession] = React.useState(false)
  const [operatingSessionId, setOperatingSessionId] = React.useState<string | null>(null)

  // 加载会话数据
  const loadSessions = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await WaSessionApi.getSessions()
      setSessions(data.sessions)
      setStats(data.stats)
    } catch (error) {
      console.error('加载会话数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 定期刷新数据
  React.useEffect(() => {
    loadSessions()
    
    // 每3秒刷新一次状态
    const interval = setInterval(loadSessions, 3000)
    
    return () => clearInterval(interval)
  }, [loadSessions])

  // 创建新会话
  const handleCreateSession = async () => {
    // 检查是否可以添加新账号
    const canAdd = stats.byState.AUTHENTICATING === 0 && stats.byState.QR_READY === 0
    if (!canAdd) {
      alert('有账号正在认证或等待扫码中，请等待完成后再添加')
      return
    }

    try {
      setIsCreatingSession(true)
      const result = await WaSessionApi.createSession()
      console.log('✅ 新会话已创建:', result.instanceId)
      
      // 立即刷新数据
      await loadSessions()
    } catch (error: any) {
      console.error('创建会话失败:', error)
      alert(error.message || '创建会话失败')
    } finally {
      setIsCreatingSession(false)
    }
  }

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('确定要删除这个会话吗？')) return

    try {
      setOperatingSessionId(sessionId)
      const success = await WaSessionApi.deleteSession(sessionId)
      if (success) {
        await loadSessions()
      } else {
        alert('删除会话失败')
      }
    } catch (error) {
      console.error('删除会话失败:', error)
      alert('删除会话失败')
    } finally {
      setOperatingSessionId(null)
    }
  }

  // 重新生成QR
  const handleRegenerateQR = async (sessionId: string) => {
    try {
      setOperatingSessionId(sessionId)
      await WaSessionApi.regenerateQR(sessionId)
      await loadSessions()
    } catch (error) {
      console.error('重新生成QR失败:', error)
      alert('重新生成QR失败')
    } finally {
      setOperatingSessionId(null)
    }
  }

  // 断开连接
  const handleDisconnect = async (sessionId: string) => {
    if (!confirm('确定要断开这个连接吗？')) return

    try {
      setOperatingSessionId(sessionId)
      await WaSessionApi.disconnectSession(sessionId)
      await loadSessions()
    } catch (error) {
      console.error('断开连接失败:', error)
      alert('断开连接失败')
    } finally {
      setOperatingSessionId(null)
    }
  }

  // 获取状态图标
  const getStateIcon = (state: SessionState) => {
    switch (state) {
      case 'CONNECTED':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'FAILED':
      case 'DISCONNECTED':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'AUTHENTICATING':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
      case 'QR_READY':
        return <QrCode className="h-4 w-4 text-orange-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  // 获取状态颜色
  const getStateBadgeColor = (state: SessionState) => {
    switch (state) {
      case 'CONNECTED':
        return 'bg-green-500'
      case 'FAILED':
      case 'DISCONNECTED':
        return 'bg-red-500'
      case 'AUTHENTICATING':
        return 'bg-blue-500'
      case 'QR_READY':
        return 'bg-orange-500'
      default:
        return 'bg-gray-500'
    }
  }

  // 判断是否可以添加新账号
  const canAddNewAccount = stats.byState.AUTHENTICATING === 0 && stats.byState.QR_READY === 0

  // 渲染会话卡片
  const renderSessionCard = (session: SessionInfo) => (
    <Card key={session.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-green-100 text-green-700">
                W
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium truncate">
                  WhatsApp {session.id.slice(-6)}
                </h3>
                <Badge className={`${getStateBadgeColor(session.state)} text-white text-xs`}>
                  {getStateDisplayText(session.state, language as 'zh' | 'en')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                ID: {session.id}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>创建: {new Date(session.createdAt).toLocaleTimeString()}</span>
          {session.connectedAt && (
            <span>连接: {new Date(session.connectedAt).toLocaleTimeString()}</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {getStateIcon(session.state)}
            <span className="text-xs">
              {getStateDisplayText(session.state, language as 'zh' | 'en')}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            {/* QR码按钮 */}
            {STATE_PERMISSIONS.canShowQR(session.state) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSessionSelected?.(session)}
                className="text-orange-600 hover:text-orange-700"
              >
                <QrCode className="h-3 w-3" />
              </Button>
            )}
            
            {/* 重新生成QR按钮 */}
            {STATE_PERMISSIONS.canRegenerate(session.state) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRegenerateQR(session.id)}
                disabled={operatingSessionId === session.id}
                className="text-blue-600 hover:text-blue-700"
              >
                {operatingSessionId === session.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            )}
            
            {/* 断开连接按钮 */}
            {STATE_PERMISSIONS.canDisconnect(session.state) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDisconnect(session.id)}
                disabled={operatingSessionId === session.id}
                className="text-orange-600 hover:text-orange-700"
              >
                {operatingSessionId === session.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Power className="h-3 w-3" />
                )}
              </Button>
            )}
            
            {/* 删除按钮 */}
            {STATE_PERMISSIONS.canDelete(session.state) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteSession(session.id)}
                disabled={operatingSessionId === session.id}
                className="text-red-600 hover:text-red-700"
              >
                {operatingSessionId === session.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
          <p>加载会话数据中...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">W</span>
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp 会话</CardTitle>
              <p className="text-sm text-muted-foreground">
                {stats.total} 个会话，{stats.connected} 个已连接
              </p>
            </div>
          </div>
          
          <Button
            onClick={handleCreateSession}
            disabled={!canAddNewAccount || isCreatingSession}
            className="flex items-center gap-2"
          >
            {isCreatingSession ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            添加账号
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {sessions.length > 0 ? (
          sessions.map(renderSessionCard)
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>暂无 WhatsApp 会话</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleCreateSession}
              disabled={isCreatingSession}
            >
              {isCreatingSession ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              创建第一个会话
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
