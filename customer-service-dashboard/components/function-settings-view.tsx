"use client"

import * as React from "react"
import { Zap, CreditCard, Calendar, Gift, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Alert, AlertDescription } from "@/components/ui/alert"

const aiFeatures = [
  {
    id: "payment",
    name: "AI 代处理支付",
    description: "允许 AI 协助客户完成支付流程和订单确认",
    icon: CreditCard,
    enabled: true,
    riskLevel: "high",
    lastUsed: "2小时前",
    successRate: "94%",
  },
  {
    id: "appointment",
    name: "AI 预约管理",
    description: "自动处理客户的预约请求和时间安排",
    icon: Calendar,
    enabled: true,
    riskLevel: "medium",
    lastUsed: "30分钟前",
    successRate: "98%",
  },
  {
    id: "redemption",
    name: "AI 积分兑换",
    description: "处理客户的积分查询和兑换请求",
    icon: Gift,
    enabled: false,
    riskLevel: "low",
    lastUsed: "1天前",
    successRate: "96%",
  },
]

export function FunctionSettingsView() {
  const [features, setFeatures] = React.useState(aiFeatures)

  const toggleFeature = (featureId: string) => {
    setFeatures((prev) =>
      prev.map((feature) => (feature.id === featureId ? { ...feature, enabled: !feature.enabled } : feature)),
    )
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "bg-red-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  const getRiskText = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "高风险"
      case "medium":
        return "中风险"
      case "low":
        return "低风险"
      default:
        return "未知"
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">功能设定</h1>
          <p className="text-muted-foreground">AI 客服功能配置</p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>高风险功能涉及支付和敏感操作，建议在故障时及时关闭以避免损失。</AlertDescription>
      </Alert>

      <div className="grid gap-6">
        {features.map((feature) => (
          <Card key={feature.id} className={`${!feature.enabled ? "opacity-60" : ""}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {feature.name}
                      <Badge className={`${getRiskColor(feature.riskLevel)} text-white text-xs`}>
                        {getRiskText(feature.riskLevel)}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`feature-${feature.id}`}>启用</Label>
                  <Switch
                    id={`feature-${feature.id}`}
                    checked={feature.enabled}
                    onCheckedChange={() => toggleFeature(feature.id)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">最后使用</Label>
                  <p className="text-sm font-medium">{feature.lastUsed}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">成功率</Label>
                  <p className="text-sm font-medium text-green-600">{feature.successRate}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">状态</Label>
                  <Badge variant={feature.enabled ? "default" : "secondary"}>
                    {feature.enabled ? "运行中" : "已停用"}
                  </Badge>
                </div>
              </div>

              {feature.riskLevel === "high" && feature.enabled && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-medium text-red-800">高风险功能提醒</p>
                  </div>
                  <p className="text-sm text-red-700">
                    此功能涉及支付操作，请确保 AI 模型稳定运行。如发现异常，请立即关闭。
                  </p>
                  <Button variant="outline" size="sm" className="mt-2 text-red-600 border-red-300 bg-transparent">
                    查看操作日志
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    配置参数
                  </Button>
                  <Button variant="outline" size="sm">
                    查看日志
                  </Button>
                </div>
                {feature.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 bg-transparent"
                    onClick={() => toggleFeature(feature.id)}
                  >
                    紧急停用
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 全局控制 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            全局控制
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">紧急停用所有 AI 功能</h4>
              <p className="text-sm text-muted-foreground">在系统故障或异常情况下，一键停用所有 AI 自动化功能</p>
            </div>
            <Button variant="destructive">
              <AlertTriangle className="h-4 w-4 mr-2" />
              紧急停用
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 功能设定正在开发中 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            功能设定正在开发中...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">此功能将提供 AI 客服的各项功能配置选项。</p>
        </CardContent>
      </Card>
    </div>
  )
}
