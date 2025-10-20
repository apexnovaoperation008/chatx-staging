"use client"
import { BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function ChatReportView() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">聊天报表</h1>
          <p className="text-muted-foreground">聊天数据统计和分析</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            聊天报表功能正在开发中...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">此功能将提供聊天数据的统计分析和报表功能。</p>
        </CardContent>
      </Card>
    </div>
  )
}
