"use client"

import { Label } from "@/components/ui/label"
import { FileText } from "lucide-react"
import * as React from "react"
import { CheckCircleIcon, XCircleIcon, Eye } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"

const aiReplies = [
  {
    id: 1,
    customer: "张小明",
    customerAvatar: "/placeholder.svg?height=32&width=32&text=张",
    platform: "whatsapp",
    customerMessage: "这个产品的保修期是多长时间？",
    aiReply:
      "您好！我们的产品提供2年质保服务，在保修期内如有质量问题可免费维修或更换。如需了解更多保修详情，请联系我们的客服团队。",
    confidence: 95,
    status: "pending",
    timestamp: "2024-03-20 14:30",
    category: "产品咨询",
  },
  {
    id: 2,
    customer: "Lisa Wang",
    customerAvatar: "/placeholder.svg?height=32&width=32&text=LW",
    platform: "telegram",
    customerMessage: "Can I return this item if I don't like it?",
    aiReply:
      "Yes, we offer a 30-day return policy for all items. The item must be in original condition with all packaging. Please contact our customer service to initiate a return request.",
    confidence: 88,
    status: "approved",
    timestamp: "2024-03-20 14:25",
    category: "退换货政策",
  },
  {
    id: 3,
    customer: "王大华",
    customerAvatar: "/placeholder.svg?height=32&width=32&text=王",
    platform: "whatsapp",
    customerMessage: "我要投诉你们的服务态度！",
    aiReply:
      "非常抱歉给您带来不好的体验。我们非常重视每一位客户的反馈，请您详细说明遇到的问题，我们会立即处理并改进服务质量。",
    confidence: 72,
    status: "rejected",
    timestamp: "2024-03-20 14:20",
    category: "投诉建议",
  },
]

export function ContentReviewView() {
  const [replies, setReplies] = React.useState(aiReplies)
  const [selectedReply, setSelectedReply] = React.useState<(typeof aiReplies)[0] | null>(null)

  const handleApprove = (id: number) => {
    setReplies((prev) => prev.map((reply) => (reply.id === id ? { ...reply, status: "approved" } : reply)))
  }

  const handleReject = (id: number) => {
    setReplies((prev) => prev.map((reply) => (reply.id === id ? { ...reply, status: "rejected" } : reply)))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-500"
      case "rejected":
        return "bg-red-500"
      case "pending":
        return "bg-yellow-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "已通过"
      case "rejected":
        return "已拒绝"
      case "pending":
        return "待审核"
      default:
        return "未知"
    }
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

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return "text-green-600"
    if (confidence >= 70) return "text-yellow-600"
    return "text-red-600"
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">回复内容审查</h1>
          <p className="text-muted-foreground">AI 回复内容质量监控</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            内容审查功能正在开发中...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">此功能将提供 AI 回复内容的质量审查和监控。</p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {replies.map((reply) => (
          <Card key={reply.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={reply.customerAvatar || "/placeholder.svg"} />
                    <AvatarFallback>{reply.customer[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{reply.customer}</CardTitle>
                      {getPlatformIcon(reply.platform)}
                    </div>
                    <p className="text-sm text-muted-foreground">{reply.timestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{reply.category}</Badge>
                  <Badge className={`${getStatusColor(reply.status)} text-white`}>{getStatusText(reply.status)}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 客户消息 */}
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium mb-1">客户消息:</p>
                <p className="text-sm">{reply.customerMessage}</p>
              </div>

              {/* AI 回复 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-blue-800">AI 回复:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">置信度:</span>
                    <span className={`text-xs font-medium ${getConfidenceColor(reply.confidence)}`}>
                      {reply.confidence}%
                    </span>
                  </div>
                </div>
                <p className="text-sm text-blue-700">{reply.aiReply}</p>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {reply.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(reply.id)}>
                        <CheckCircleIcon className="h-4 w-4 mr-2" />
                        通过
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleReject(reply.id)}>
                        <XCircleIcon className="h-4 w-4 mr-2" />
                        拒绝
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedReply(reply)}>
                    <Eye className="h-4 w-4 mr-2" />
                    详细查看
                  </Button>
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  编辑回复
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 详细查看弹窗 */}
      {selectedReply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>回复详情审查</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedReply(null)}>
                  <XCircleIcon className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label>客户姓名</Label>
                  <p className="font-medium">{selectedReply.customer}</p>
                </div>
                <div>
                  <Label>平台来源</Label>
                  <div className="flex items-center gap-2">
                    {getPlatformIcon(selectedReply.platform)}
                    <span className="capitalize">{selectedReply.platform}</span>
                  </div>
                </div>
                <div>
                  <Label>消息时间</Label>
                  <p>{selectedReply.timestamp}</p>
                </div>
                <div>
                  <Label>置信度</Label>
                  <p className={getConfidenceColor(selectedReply.confidence)}>{selectedReply.confidence}%</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>客户原始消息</Label>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm">{selectedReply.customerMessage}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>AI 生成回复</Label>
                <Textarea
                  className="min-h-[100px]"
                  defaultValue={selectedReply.aiReply}
                  placeholder="编辑 AI 回复内容..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedReply(null)}>
                  取消
                </Button>
                <Button>保存修改</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
