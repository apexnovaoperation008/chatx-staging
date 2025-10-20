"use client"
import { TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function AIMetricsView() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">AI 回复率</h1>
          <p className="text-muted-foreground">AI 自动回复效果分析</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            AI 回复率分析功能正在开发中...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">此功能将提供 AI 自动回复的效果分析和统计报告。</p>
        </CardContent>
      </Card>
    </div>
  )
}
