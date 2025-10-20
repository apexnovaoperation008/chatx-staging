"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import * as React from "react"
import {
  MessageSquare,
  BarChart3,
  Settings,
  Users,
  UserPlus, 
  LogOut,
  User,
  ChevronRight,
  ChevronDown,
  Home,
  Award,
  Plus,
} from "lucide-react"
import { useLanguage } from "@/contexts/language-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageToggle } from "@/components/language-toggle"
import { RealTimeClock } from "@/components/real-time-clock"
import { AddAccountDialog } from "@/components/add-account-dialog"
import { ProfileDialog } from "@/components/profile-dialog"

// 导入页面组件
import { DashboardView } from "@/components/dashboard-view"
import { AllChatsView } from "@/components/all-chats-view"
import { AccountManagementView } from "@/components/account-management-view"
import { KPIView } from "@/components/kpi-view"
import { ChatReportView } from "@/components/chat-report-view"
import { PermissionsManagementView } from "@/components/permissions-management-view"
import { WorkspacesManagementView } from "@/components/workspace-management-view"
import { PlansManagementView } from "@/components/plan-management-view"
import { useAuth } from "@/contexts/auth-context"

interface SubmenuItem {
  id: string
  title: string
  icon: React.ComponentType<any>
  permission: string
  badge?: string
}

interface MenuItem {
  id: string
  title: string
  icon: React.ComponentType<any>
  permission: string
  hasSubmenu: boolean
  badge?: string
  submenuItems?: SubmenuItem[]
}

export function MainLayout() {
  const [activeModule, setActiveModule] =  React.useState<string>("")
  const [expandedMenus, setExpandedMenus] = React.useState<string[]>(["customer-service"])
  const [isProfileDialogOpen, setIsProfileDialogOpen] = React.useState(false)
  const { user, logout, hasPermission, fetchCurrentUser } = useAuth()
  const { t } = useLanguage()

  const menuItems: MenuItem[] = [
    {
      id: "dashboard",
      title: t("nav.dashboard"),
      icon: Home,
      permission: "workspace.manage",
      hasSubmenu: false,
    },
    {
      id: "customer-service",
      title: t("nav.customer_service"),
      icon: MessageSquare,
      permission: "chat.view",
      hasSubmenu: true,
      badge: "12",
      submenuItems: [
        { id: "all-chats", title: t("nav.all_chats"), icon: Users, permission: "chat.view" },
        { id: "account-management", title: t("nav.account_management"), icon: UserPlus, permission: "chat.manage" },
      ],
    },
    {
      id: "data-reports",
      title: t("nav.data_reports"),
      icon: BarChart3,
      permission: "reports.view",
      hasSubmenu: true,
      submenuItems: [
        { id: "kpi", title: t("nav.kpi"), icon: Award, permission: "reports.view" },
        { id: "chat-report", title: t("nav.chat_report"), icon: BarChart3, permission: "reports.view" },
      ],
    },
    {
      id: "system-management",
      title: t("nav.system_management"),
      icon: Settings,
      permission: "user.view",
      hasSubmenu: true,
      submenuItems: [
        {
          id: "permissions-management",
          title: t("nav.permissions_management"),
          icon: Settings,
          permission: "user.view",
        },
        { id: "workspace-settings", title: t("nav.workspaces_management"), icon: Settings, permission: "workspace.view" },
        { id: "plan-settings", title: t("nav.plans_management"), icon: Settings, permission: "plan.manage" }
      ],
    },
  ]

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) => (prev.includes(menuId) ? prev.filter((id) => id !== menuId) : [...prev, menuId]))
  }

  const filteredMenuItems: MenuItem[] = menuItems
  .map((menu) => {
    if (menu.hasSubmenu && menu.submenuItems) {
      const filteredSubmenu = menu.submenuItems.filter((sub) =>
        hasPermission(sub.permission)
      )
      return filteredSubmenu.length > 0 ? { ...menu, submenuItems: filteredSubmenu }: null
    }
    return hasPermission(menu.permission) ? menu : null
  })
  .filter((menu): menu is MenuItem => menu !== null)

  const handleMenuClick = (menuId: string, hasSubmenu: boolean) => {
    if (hasSubmenu) {
      toggleMenu(menuId)
    } else {
      setActiveModule(menuId)
    }
  }

  React.useEffect(() => {
    fetchCurrentUser()
  }, []); 

  React.useEffect(() => {
    if (!activeModule && filteredMenuItems.length > 0) {
      // Find the first valid submenu or top-level item
      const first = filteredMenuItems[0]
      console.log(first?.id)
      if (first?.hasSubmenu) {
        setActiveModule(first?.submenuItems?.[0]?.id ?? "")
      } else {
        setActiveModule(first.id)
      }
    }
  }, [filteredMenuItems, activeModule])

  const renderMainContent = () => {
    switch (activeModule) {
      case "dashboard":
        return <DashboardView />
      case "all-chats":
        return <AllChatsView />
      case "account-management":
        return <AccountManagementView />
      case "kpi":
        return <KPIView />
      case "chat-report":
        return <ChatReportView />
      case "permissions-management":
        return <PermissionsManagementView />
      case "workspace-settings":
        return <WorkspacesManagementView />
      case "plan-settings":
        return <PlansManagementView />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role?.toUpperCase()) {
      case "SUPERADMIN":
        return "bg-red-500"
      case "MANAGER":
        return "bg-blue-500"
      case "SUPERVISOR":
        return "bg-green-500"
      case "AGENT":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  const getRoleDisplayName = (role: string) => {
    switch (role?.toUpperCase()) { 
      case "SUPERADMIN":
        return t("user.role.superadmin")
      case "MANAGER":
        return t("user.role.manager")
      case "SUPERVISOR":
        return t("user.role.supervisor")
      case "AGENT":
        return t("user.role.agent")
      default:
        return "Unknown"
    }
  }

  return (
    <SidebarProvider>
      <Sidebar className="border-r">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold">{t("system.title")}</span>
              {/* <span className="text-xs text-muted-foreground">{t("system.subtitle")}</span> */}
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems
                  .filter((item) => !item.permission || hasPermission(item.permission))
                  .map((item) => (
                    <React.Fragment key={item.id}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={activeModule === item.id}
                          onClick={() => handleMenuClick(item.id, item.hasSubmenu)}
                        >
                          <button className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <item.icon className="size-4" />
                              <span>{item.title}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {item.badge && (
                                <Badge variant="secondary" className="h-5 min-w-[20px] text-xs">
                                  {item.badge}
                                </Badge>
                              )}
                              {item.hasSubmenu && (
                                <div className="ml-1">
                                  {expandedMenus.includes(item.id) ? (
                                    <ChevronDown className="size-3" />
                                  ) : (
                                    <ChevronRight className="size-3" />
                                  )}
                                </div>
                              )}
                            </div>
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>

                      {/* 子菜单 */}
                      {item.hasSubmenu && (
                        <div
                          className={`ml-6 overflow-hidden transition-all duration-300 ease-in-out ${
                            expandedMenus.includes(item.id) ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="space-y-1 py-1">
                            {item.submenuItems
                              ?.filter((subItem) => !subItem.permission || hasPermission(subItem.permission))
                              .map((subItem) => (
                                <SidebarMenuItem key={subItem.id}>
                                  <SidebarMenuButton
                                    asChild
                                    size="sm"
                                    isActive={activeModule === subItem.id}
                                    onClick={() => setActiveModule(subItem.id)}
                                  >
                                    <button className="flex items-center justify-between w-full text-muted-foreground hover:text-foreground">
                                      <div className="flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                                        <span className="text-sm">{subItem.title}</span>
                                      </div>
                                      {subItem.badge && (
                                        <Badge variant="outline" className="h-4 min-w-[16px] text-xs">
                                          {subItem.badge}
                                        </Badge>
                                      )}
                                    </button>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              ))}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* 用户信息 */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatar || "/placeholder.svg"} />
              <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">{user?.name}</p>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${getRoleBadgeColor(user?.role || "")}`}></span>
                <p className="text-xs text-muted-foreground">{getRoleDisplayName(user?.role|| "")}</p>
              </div>
            </div>
          </div>
        </div>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* 顶部 Header */}
        <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b bg-background px-6">
          <div className="flex items-center gap-4">
            <RealTimeClock />
          </div>

          <div className="flex items-center gap-3">
            {/* 快速添加账号按钮 */}
            {hasPermission("account.manage") && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <AddAccountDialog
                          trigger={
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-transparent">
                              <Plus className="h-4 w-4" />
                              <span className="sr-only">{t("tooltip.add_account")}</span>
                            </Button>
                          }
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("tooltip.add_account")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Separator orientation="vertical" className="h-6" />
              </>
            )}

            <LanguageToggle />
            <ThemeToggle />
            <Separator orientation="vertical" className="h-6" />

            <TooltipProvider>
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user?.avatar || "/placeholder.svg"} />
                          <AvatarFallback className="text-xs">{user?.name?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{user?.name}</span>
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setIsProfileDialogOpen(true)}>
                      <User className="mr-2 h-4 w-4" />
                      {t("user.profile")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      {t("user.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent>
                  <p>{t("tooltip.user_menu")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        {/* 主要内容区域 */}
        <main className={`flex-1 ${activeModule === 'all-chats' ? 'overflow-hidden' : 'overflow-auto'}`}>
          {renderMainContent()}
        </main>
      </SidebarInset>

      {/* Profile Dialog */}
      <ProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
      />
    </SidebarProvider>
  )
}
