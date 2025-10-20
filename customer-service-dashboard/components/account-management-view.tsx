"use client"

import * as React from "react"
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Settings,
  Smartphone,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { AddAccountDialog } from "@/components/add-account-dialog"
import { AddWaAccountDialog } from "@/components/add-wa-account-dialog"
import { AddTelegramAccountDialog } from "@/components/add-telegram-account-dialog"
import { EditAccountDialog } from "@/components/edit-account-dialog"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { AccountManagementApi, AccountInfo, AccountStats } from "@/lib/account-management-api"
import { useToast } from "@/components/ui/use-toast"
import { SessionApi } from "@/lib/api";
import { useSocket } from "@/contexts/socket-provider";
import dayjs from "dayjs";

interface Account {
  sessionId: string
  platform: "whatsapp" | "telegram"
  displayName: string
  phoneNumber?: string
  username?: string
  avatar: string
  status: "connected" | "disconnected" | "error"
  isActive: boolean
  lastSeen: string
  messageCount: number
  createdAt: string
  description?: string
}


export function AccountManagementView() {
  //const { hasPermission } = useAuth()
  const { user, logout, hasPermission, fetchCurrentUser } = useAuth()
  const { t } = useLanguage()
  const { socket } = useSocket(); // 👈 access socket instance
  const { toast } = useToast()
  const [accounts, setAccounts] = React.useState<AccountInfo[]>([])
  const [stats, setStats] = React.useState<AccountStats>({
    totalAccounts: 0,
    connectedAccounts: 0,
    activeAccounts: 0,
    todayMessages: 0,
    whatsappCount: 0,
    telegramCount: 0,
    whatsappConnected: 0,
    telegramConnected: 0,
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [isWaDialogOpen, setIsWaDialogOpen] = React.useState(false)
  const [isTgDialogOpen, setIsTgDialogOpen] = React.useState(false)
  const [selectedPlatform, setSelectedPlatform] = React.useState<"whatsapp" | "telegram">("whatsapp")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [whatsappExpanded, setWhatsappExpanded] = React.useState(true)
  const [telegramExpanded, setTelegramExpanded] = React.useState(true)
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<Set<string>>(new Set())
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null)
  const [deletingAccountId, setDeletingAccountId] = React.useState<string | null>(null)
  const [editingAccount, setEditingAccount] = React.useState<AccountInfo | null>(null)

  // 检查权限
  if (!hasPermission("chat.manage")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">权限不足</h3>
            <p className="text-muted-foreground">您没有权限访问此页面</p>
          </CardContent>  
        </Card>
      </div>
    )
  }

  // 加载账号数据
  const loadAccountData = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const [accountsData, statsData] = await Promise.all([
        AccountManagementApi.getAccounts(),
        AccountManagementApi.getAccountStats()
      ])
      setAccounts(accountsData)
      setStats(statsData)
    } catch (error) {
      console.error('加载账号数据失败:', error)
      // 保持空数据状态，显示零值
    } finally {
      setIsLoading(false)
    }
  }, [toast])


  React.useEffect(() => {
    loadAccountData()
    
    // 🔄 监听全局账号相关事件
    const handleAccountAdded = (event: CustomEvent) => {
      console.log('🔄 收到全局账号添加事件，刷新数据:', event.detail)
      loadAccountData()
    }
    
    const handleRefreshAccounts = () => {
      console.log('🔄 收到通用账号刷新事件，刷新数据')
      loadAccountData()
    }
    
    const handleAccountDataChanged = () => {
      console.log('🔄 收到账号数据变更事件，刷新数据')
      loadAccountData()
    }
    
    // 监听多个事件
    window.addEventListener('accountAdded', handleAccountAdded as EventListener)
    window.addEventListener('refreshAccounts', handleRefreshAccounts as EventListener)
    window.addEventListener('accountDataChanged', handleAccountDataChanged as EventListener)
    
    // 清理事件监听器
    return () => {
      window.removeEventListener('accountAdded', handleAccountAdded as EventListener)
      window.removeEventListener('refreshAccounts', handleRefreshAccounts as EventListener)
      window.removeEventListener('accountDataChanged', handleAccountDataChanged as EventListener)
    }
  }, [loadAccountData])


  // 过滤账号并去重
  const filteredAccounts = accounts
    .filter(
      (account) =>
        (account.displayName && account.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (account.phoneNumber && account.phoneNumber.includes(searchTerm)) ||
        (account.username && account.username.toLowerCase().includes(searchTerm.toLowerCase())),
    )
    // 去重：确保不会有重复的账号ID（跨平台）
    .filter((account, index, self) =>
      index === self.findIndex(a => a.id === account.id && a.platform === account.platform)
    )

  React.useEffect(() => {
    if (!socket) return;
  
    const handleLogout = (data: { sessionId: string; reason: string }) => {
      console.log("📡 收到登出事件:", data);
  
      if (data.reason !== "LOGGED_OUT") return;
  
      setAccounts((prevAccounts) => {
        const updatedAccounts = prevAccounts.map((acc) => {
          if (acc.sessionId !== data.sessionId && acc.id !== data.sessionId)
            return acc;
          return { ...acc, status: "disconnected" as const };
        });
  
        setStats((prevStats) => ({
          ...prevStats,
          connectedAccounts: updatedAccounts.filter(
            (a) => a.status === "connected"
          ).length,
        }));
  
        return updatedAccounts;
      });
    };
  
    socket.on("wa:logout", handleLogout);
  
    // ✅ Correct cleanup — no implicit return value
    return () => {
      socket.off("wa:logout", handleLogout);
    };
  }, [socket]);

  const whatsappAccounts = filteredAccounts.filter((account) => account.platform === "whatsapp")
  const telegramAccounts = filteredAccounts.filter((account) => account.platform === "telegram")

  const getPlatformIcon = (platform: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "w-8 h-8" : "w-10 h-10"  // 再次增大：sm改为8，md改为10
    if (platform === "whatsapp") {
      return (
        <img 
          src="/logos/WhatsApp.png" 
          alt="WhatsApp" 
          className={`${sizeClass} object-contain`}  // 去掉外圈，直接显示Logo
        />
      )
    }
    return (
      <img 
        src="/logos/Telegram.png" 
        alt="Telegram" 
        className={`${sizeClass} object-contain`}  // 去掉外圈，直接显示Logo
      />
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-500"
      case "disconnected":
        return "bg-gray-400"
      case "error":
        return "bg-red-500"
      default:
        return "bg-gray-400"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "connected":
        return t("account.status_connected")
      case "disconnected":
        return t("account.status_disconnected")
      case "error":
        return t("account.status_error")
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "disconnected":
        return <XCircle className="h-4 w-4 text-gray-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <XCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const formatLastSeen = (lastSeen: string) => {
    if (!lastSeen) return t('account.not_connected');
    try {
      return dayjs(lastSeen).format("YYYY-MM-DD HH:mm:ss");
    } catch (error) {
      console.error('Error formatting last seen time:', error);
      return lastSeen; // fallback to original format if parsing fails
    }
  }

  const handleCreateAccount = () => {
    setIsDialogOpen(true)
  }

  const handleEditAccount = (account: AccountInfo) => {
    setEditingAccount(account)
  }

  const handleDeleteAccount = async (accountId: string) => {
    try {
      setDeletingAccountId(accountId)
      const success = await AccountManagementApi.deleteAccount(accountId)
      if (success) {
        // 重新加载数据
        await loadAccountData()
        setDeleteConfirmId(null)

      
        toast({
          title: t('account.deleted'),
          description: t('account.delete_success'),
          duration: 3000,
        });
      } else {
        console.warn('删除账号返回非成功状态:', success);
        alert(t('account.delete_failed'));
      }
    } catch (error) {
      console.error('删除账号失败:', error)
      alert(t('account.delete_failed'))
    } finally {
      setDeletingAccountId(null)

    }
  };
   

  const toggleDescription = (accountId: string) => {
    const newExpanded = new Set(expandedDescriptions)
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId)
    } else {
      newExpanded.add(accountId)
    }
    setExpandedDescriptions(newExpanded)
  }

  const handleToggleActive = async (accountId: string) => {
    try {
      const account = accounts.find(acc => acc.id === accountId);
      if (!account) return;
  
      console.log(`🔄 切换账号状态: ${accountId} -> ${!account.isActive ? "启用" : "禁用"}`);
  
      const updatedAccount = await AccountManagementApi.toggleAccountActive(accountId, !account.isActive);
  
      if (updatedAccount) {
        // ✅ Update local state
        setAccounts(prev =>
          prev.map(acc =>
            acc.id === accountId
              ? { ...acc, isActive: updatedAccount.isActive, displayName: acc.displayName, username: acc.username, phoneNumber: acc.phoneNumber }
              : acc
          )
        );
  
        // ✅ Optionally reload stats
        const newStats = await AccountManagementApi.getAccountStats();
        setStats(newStats);
  
        // 🔄 Trigger refresh events
        console.log("🔁 账号状态切换完成，刷新全局数据");
        window.dispatchEvent(new CustomEvent("refreshAccounts"));
        window.dispatchEvent(new CustomEvent("accountDataChanged"));
      } else {
        alert(t("account.toggle_failed"));
      }
    } catch (error) {
      console.error("❌ 切换账号状态失败:", error);
      alert(t("account.toggle_failed"));
    }
  };
  

  const handleSaveAccount = () => {
    setIsDialogOpen(false)
    // 重新加载数据以获取最新的账号信息
    loadAccountData()
  }

  const handleToggleAllExpanded = () => {
    const newState = !(whatsappExpanded && telegramExpanded)
    setWhatsappExpanded(newState)
    setTelegramExpanded(newState)
  }

  // 渲染账号卡片
  const renderAccountCard = (account: AccountInfo) => {
    const isDeleting = deletingAccountId === account.id;
    
    return (
      <Card key={`${account.platform}-${account.id}`} className={`hover:shadow-md transition-shadow ${isDeleting ? 'opacity-60' : ''}`}>
        <CardContent className="p-4">
          {isDeleting ? (
            // 删除中的加载状态
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-red-600" />
                <div className="text-center">
                  <p className="text-sm font-medium text-red-600">{t('account.deleting')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('account.deleting_description')}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src="/placeholder.svg" />
                    <AvatarFallback>{account.displayName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate flex items-center gap-1">
                        {(!account.workspaceId || !account.brandId) && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        {account.displayName}
                      </h3>
                      <Badge className={`${getStatusColor(account.status)} text-white text-xs`}>
                        {getStatusText(account.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {account.platform === "whatsapp" ? account.phoneNumber : account.username}
                    </p>
                  </div>
                </div>
                <Switch checked={account.isActive} onCheckedChange={() => handleToggleActive(account.id)} />
              </div>

              {account.description && (
                <div className="mb-3">
                  <p className={`text-xs text-muted-foreground ${
                    expandedDescriptions.has(account.id) ? '' : 'line-clamp-1'
                  }`}>
                    {account.description}
                  </p>
                  {account.description.length > 50 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700 mt-1"
                      onClick={() => toggleDescription(account.id)}
                    >
                      {expandedDescriptions.has(account.id) 
                        ? t("account.collapse_description") 
                        : t("account.expand_description")
                      }
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                <span>{t('account.last_active')}: {formatLastSeen(account.lastSeen)}</span>
                <span>{t('account.messages')}: {account.messageCount}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {getStatusIcon(account.status)}
                  <span className="text-xs">
                    {account.status === "connected" ? t('account.connection_normal') : account.status === "error" ? t('account.connection_error') : t('account.not_connected')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEditAccount(account)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleteConfirmId(account.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold">{t('account.title')}</h1>
            <p className="text-muted-foreground">{t('account.subtitle')}</p>
          </div>
        </div>
        <AddAccountDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t('account.add_account')}
            </Button>
          }
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
        />
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('account.total_accounts')}</p>
                <p className="text-2xl font-bold">{stats.totalAccounts}</p>
              </div>
              <Smartphone className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('account.connected')}</p>
                <p className="text-2xl font-bold text-green-600">{stats.connectedAccounts}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('account.active_accounts')}</p>
                <p className="text-2xl font-bold text-blue-600">{stats.activeAccounts}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('account.today_messages')}</p>
                <p className="text-2xl font-bold text-purple-600">{stats.todayMessages}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和控制栏 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('account.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleToggleAllExpanded} className="flex items-center gap-2 bg-transparent">
          {whatsappExpanded && telegramExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              {t('account.collapse_all')}
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              {t('account.expand_all')}
            </>
          )}
        </Button>
      </div>

      {/* 双列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp 账号列 */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setWhatsappExpanded(!whatsappExpanded)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getPlatformIcon("whatsapp")}
                  <div>
                    <CardTitle className="text-lg">{t('account.whatsapp_accounts')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{stats.whatsappCount} {t('account.account_count')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {stats.whatsappConnected} {t('account.connected')}
                  </Badge>
                  {whatsappExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
            {whatsappExpanded && (
              <CardContent className="space-y-3">
                {whatsappAccounts.length > 0 ? (
                  whatsappAccounts.map(renderAccountCard)
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('account.no_whatsapp')}</p>
                    <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={() => setIsWaDialogOpen(true)}>
                      {t('account.add_whatsapp')}
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Telegram 账号列 */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setTelegramExpanded(!telegramExpanded)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getPlatformIcon("telegram")}
                  <div>
                    <CardTitle className="text-lg">{t('account.telegram_accounts')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{stats.telegramCount} {t('account.account_count')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {stats.telegramConnected} {t('account.connected')}
                  </Badge>
                  {telegramExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
            {telegramExpanded && (
              <CardContent className="space-y-3">
                {telegramAccounts.length > 0 ? (
                  telegramAccounts.map(renderAccountCard)
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('account.no_telegram')}</p>
                    <Button variant="outline" size="sm" className="mt-2 bg-transparent" onClick={() => setIsTgDialogOpen(true)}>
                      {t('account.add_telegram')}
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* 新的WhatsApp添加对话框 */}
      <AddWaAccountDialog
        open={isWaDialogOpen}
        onOpenChange={setIsWaDialogOpen}
        onAccountAdded={loadAccountData}
      />

      {/* 新的Telegram添加对话框 */}
      <AddTelegramAccountDialog
        open={isTgDialogOpen}
        onOpenChange={setIsTgDialogOpen}
        onAccountAdded={loadAccountData}
      />

      {/* 编辑账号对话框 */}
      <EditAccountDialog
        account={editingAccount}
        open={!!editingAccount}
        onOpenChange={(open) => !open && setEditingAccount(null)}
        onAccountUpdated={loadAccountData}
      />

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("account.delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("account.delete_confirm_message")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteConfirmId && handleDeleteAccount(deleteConfirmId)}
              disabled={!!deletingAccountId}
            >
              {deletingAccountId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("account.deleting")}
                </>
              ) : (
                t("account.delete_confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
