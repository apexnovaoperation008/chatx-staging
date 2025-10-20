"use client"

import * as React from "react"
import { Target } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarTrigger } from "@/components/ui/sidebar"

const brandSettings = [
  {
    id: "brand1",
    name: "主品牌",
    aiEnabled: true,
    coverage: 85,
    privateChats: true,
    groupChats: false,
    platforms: ["whatsapp", "telegram"],
    userTypes: ["new", "regular"],
  },
  {
    id: "brand2",
    name: "子品牌A",
    aiEnabled: true,
    coverage: 60,
    privateChats: true,
    groupChats: true,
    platforms: ["whatsapp"],
    userTypes: ["vip", "regular"],
  },
]

export function AICoverageView() {
  const [settings, setSettings] = React.useState(brandSettings)

  const updateBrandSetting = (brandId: string, key: string, value: any) => {
    setSettings((prev) => prev.map((brand) => (brand.id === brandId ? { ...brand, [key]: value } : brand)))
  }

  const getPlatformIcon = (platform: string) => {
    if (platform === "whatsapp") {
      return (
        <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">W</span>
        </div>
      )
    }
    return (
      <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
        <span className="text-white text-xs font-bold">T</span>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">覆盖率设定</h1>
          <p className="text-muted-foreground">AI 自动回复覆盖率配置</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            AI 覆盖率设定功能正在开发中...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">此功能将允许您配置 AI 自动回复的覆盖范围和触发条件。</p>
        </CardContent>
      </Card>

      {/* 全局统计 */}
      <Card>
        <CardHeader>
          <CardTitle>覆盖率统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">78%</p>
              <p className="text-sm text-muted-foreground">总体 AI 覆盖率</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">1,245</p>
              <p className="text-sm text-muted-foreground">今日 AI 处理对话</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">312</p>
              <p className="text-sm text-muted-foreground">转交人工对话</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">95%</p>
              <p className="text-sm text-muted-foreground">AI 处理成功率</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
