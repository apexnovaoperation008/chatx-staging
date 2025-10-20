"use client"
import { Shield, MessageSquare, Users, TrendingUp, Clock, BarChart3, Activity, AlertCircle, CheckCircle, SeparatorVertical} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { Separator } from "@radix-ui/react-separator"
import * as React from "react"

interface Manager {
  id: number
  email: string
  name: string
  role_id?: number
  role_name: string
  permissions: string[]
  createdAt: string
  lastLogin?: string
  workspace_id?: string
  plan_id?: number
  plan_name?: string
  department?:string
  isActive: boolean
  workspace_count?: number
  max_workspace ?: number
  max_account ?: number
}

export function DashboardView() {
  const { user, users , managers, fetchUsers, fetchManagers, hasPermission} = useAuth()
  const { t } = useLanguage()
  const [editingManager, setEditingManager] = React.useState<Manager | null>(null)

  
  React.useEffect(() => {
    fetchManagers()
    fetchUsers()
  },[])

  const stats = [
    {
      title: t("dashboard.today_conversations"),
      value: "1,234",
      change: "+12%",
      icon: MessageSquare,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: t("dashboard.active_users"),
      value: "892",
      change: "+8%",
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
  ]

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

  const currentManager = (managers || []).find((manager) => manager.id === user?.id)
  const planName = currentManager?.plan_name
  const workspaceCount = currentManager?.workspace_count || 0
  const maxWorkspace = currentManager?.max_workspace || 0
  const accountCount = (users || []).filter((users) => users.assigned_to === currentManager?.id )
                                    .filter((users) => users.is_active === true).length
  const maxAccount = currentManager?.max_account || 0
  const workspaceStatus = maxWorkspace - workspaceCount
  const accountStatus = maxAccount - accountCount

  const accountPercentage = maxAccount > 0 ? (accountStatus / maxAccount) * 100 : 100
  const workspacePercentage = maxWorkspace > 0 ? (workspaceStatus / maxWorkspace) * 100 : 100

  // Determine color based on percentage remaining
  const getStatusColor = (percentage: number) => {
    if (percentage > 50) return 'text-green-600'
    if (percentage > 20) return 'text-yellow-600'
    return 'text-red-600'
}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
            <h1 className="text-muted-foreground">
              {t("dashboard.welcome_back")}，{user?.name}
            </h1>
          </div>
        </div> 
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* {plans.map((plan, index) => ( */}
        <Card key={1} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            
            {/* Plan Information Table */}
            <div className="space-y-3">
              {/* Plan ID Row */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("dashboard.plan_id")}:
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold">{planName}</span>
                </div>
              </div>

              {/* Accounts Row */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("dashboard.accounts")}:
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-semibold ${getStatusColor(accountPercentage)}`}>
                    {currentManager?.max_account === 0 ? (
                      `${accountCount}/♾️`
                    ) : (
                      `${accountCount}/${maxAccount}`
                    )}
                  </span>
                </div>
              </div>

              {/* Workspaces Row */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("dashboard.workspaces")}:
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-semibold ${getStatusColor(workspacePercentage)}`}>
                    {currentManager?.max_workspace === 0 ? (
                      `${workspaceCount}/♾️`
                    ) : (
                      `${workspaceCount}/${maxWorkspace}`
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/* ))} */}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  <p className={`text-sm mt-1 ${stat.change.startsWith("+") ? "text-green-600" : "text-red-600"}`}>
                    {stat.change} {t("dashboard.compared_yesterday")}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
