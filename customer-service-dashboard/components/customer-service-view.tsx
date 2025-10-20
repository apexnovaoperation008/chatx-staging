"use client"

import * as React from "react"
import { useLanguage } from "@/contexts/language-context"
import {
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  TrendingUp,
  Filter,
  Search,
  MoreVertical,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// 模拟待处理对话数据
const pendingChats = [
  {
    id: "1",
    customer: "王大明",
    avatar: "/placeholder.svg?height=40&width=40&text=王",
    platform: "whatsapp",
    lastMessage: "我需要立即处理这个问题",
    waitTime: "2分钟前",
    priority: "high",
    category: "技术支持",
    status: "waiting",
  },
  {
    id: "2",
    customer: "Lisa Chen",
    avatar: "/placeholder.svg?height=40&width=40&text=LC",
    platform: "telegram",
    lastMessage: "The app keeps crashing when I try to login",
    waitTime: "8分钟前",
    priority: "medium",
    category: "技术支持",
    status: "waiting",
  },
  {
    id: "3",
    customer: "张小华",
    avatar: "/placeholder.svg?height=40&width=40&text=张",
    platform: "whatsapp",
    lastMessage: "请问你们的退款政策是什么？",
    waitTime: "15分钟前",
    priority: "low",
    category: "售后服务",
    status: "waiting",
  },
  {
    id: "4",
    customer: "John Smith",
    avatar: "/placeholder.svg?height=40&width=40&text=JS",
    platform: "telegram",
    lastMessage: "I want to upgrade my subscription",
    waitTime: "22分钟前",
    priority: "medium",
    category: "销售咨询",
    status: "waiting",
  },
]

export function CustomerServiceView() {
  const [selectedFilter, setSelectedFilter] = React.useState("all")
  const [searchTerm, setSearchTerm] = React.useState("")
  const { t } = useLanguage() // 使用翻译 hook

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
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

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case "high":
        return t("priority.high")
      case "medium":
        return t("priority.medium")
      case "low":
        return t("priority.low")
      default:
        return "Unknown"
    }
  }

  const handleAssignToSelf = (chatId: string) => {
    console.log("分配给自己:", chatId)
  }

  const handleQuickReply = (chatId: string) => {
    console.log("快速回复:", chatId)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold">{t("service.title")}</h1>
            <p className="text-muted-foreground">{t("service.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            {t("service.filter")}
          </Button>
          <Button size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            {t("service.reply_immediately")}
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("chat.pending")}</p>
                <p className="text-2xl font-bold text-red-600">12</p>
              </div>
              <Clock className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("chat.processing")}</p>
                <p className="text-2xl font-bold text-yellow-600">8</p>
              </div>
              <MessageSquare className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("chat.completed")}</p>
                <p className="text-2xl font-bold text-green-600">45</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("chat.avg_response")}</p>
                <p className="text-2xl font-bold text-blue-600">3.2分</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选和搜索 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("service.search_customer")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedFilter} onValueChange={setSelectedFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.all_conversations")}</SelectItem>
            <SelectItem value="high">{t("filter.high_priority")}</SelectItem>
            <SelectItem value="medium">{t("filter.medium_priority")}</SelectItem>
            <SelectItem value="low">{t("filter.low_priority")}</SelectItem>
            <SelectItem value="technical">{t("filter.technical_support")}</SelectItem>
            <SelectItem value="sales">{t("filter.sales_inquiry")}</SelectItem>
            <SelectItem value="service">{t("filter.after_sales")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 待处理对话列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            {t("service.pending_conversations_count")} ({pendingChats.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {pendingChats.map((chat) => (
              <div key={chat.id} className="p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={chat.avatar || "/placeholder.svg"} />
                    <AvatarFallback>{chat.customer[0]}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{chat.customer}</h3>
                      {getPlatformIcon(chat.platform)}
                      <Badge className={`${getPriorityColor(chat.priority)} text-white text-xs`}>
                        {getPriorityText(chat.priority)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {chat.category}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {t("time.last_message")}: {chat.lastMessage}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("time.waiting_time")}: {chat.waitTime}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t("common.status")}: {t("service.status_waiting")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleAssignToSelf(chat.id)}>
                      {t("chat.assign_to_me")}
                    </Button>
                    <Button size="sm" onClick={() => handleQuickReply(chat.id)}>
                      {t("service.reply_immediately")}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>查看详情</DropdownMenuItem>
                        <DropdownMenuItem>分配给其他客服</DropdownMenuItem>
                        <DropdownMenuItem>标记为已解决</DropdownMenuItem>
                        <DropdownMenuItem>添加备注</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI 转接建议 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            {t("service.ai_suggestions_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">{t("service.technical_detected")}</p>
                  <p className="text-xs text-blue-700 mt-1">检测到 3 个对话包含技术关键词，建议优先处理</p>
                </div>
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 bg-transparent">
                  {t("service.view_details_btn")}
                </Button>
              </div>
            </div>

            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">AI 已成功处理 15 个常见问题</p>
                  <p className="text-xs text-green-700 mt-1">节省人工处理时间约 45 分钟</p>
                </div>
                <Button size="sm" variant="outline" className="text-green-600 border-green-300 bg-transparent">
                  {t("service.view_report_btn")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
