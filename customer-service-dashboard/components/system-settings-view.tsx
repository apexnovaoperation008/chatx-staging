"use client"
import { Settings } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SystemSettingsView() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">系统设置</h1>
          <p className="text-muted-foreground">系统配置和管理选项</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            系统配置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">系统设置功能正在开发中...</p>
        </CardContent>
      </Card>
    </div>
  )
}
