"use client"

import * as React from "react"
import { Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

const customerTags = [
  {
    id: 1,
    name: "VIP客户",
    color: "bg-purple-500",
    description: "高价值客户，享受优先服务",
    userCount: 1250,
    createdAt: "2024-01-15",
    rules: ["消费金额 > 10000", "会员等级 = 钻石"],
  },
  {
    id: 2,
    name: "新用户",
    color: "bg-green-500",
    description: "注册时间少于30天的新客户",
    userCount: 3420,
    createdAt: "2024-02-01",
    rules: ["注册时间 < 30天", "订单数量 = 0"],
  },
  {
    id: 3,
    name: "高风险",
    color: "bg-red-500",
    description: "存在风险行为的客户",
    userCount: 89,
    createdAt: "2024-01-20",
    rules: ["退款次数 > 3", "投诉次数 > 2"],
  },
  {
    id: 4,
    name: "活跃用户",
    color: "bg-blue-500",
    description: "近期活跃度较高的客户",
    userCount: 8900,
    createdAt: "2024-02-10",
    rules: ["最后登录 < 7天", "月订单数 > 2"],
  },
]

export function CustomerTagsView() {
  const [tags, setTags] = React.useState(customerTags)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [editingTag, setEditingTag] = React.useState<(typeof customerTags)[0] | null>(null)

  const handleDeleteTag = (tagId: number) => {
    setTags((prev) => prev.filter((tag) => tag.id !== tagId))
  }

  const handleEditTag = (tag: (typeof customerTags)[0]) => {
    setEditingTag(tag)
    setIsDialogOpen(true)
  }

  const handleCreateTag = () => {
    setEditingTag(null)
    setIsDialogOpen(true)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">客户标签</h1>
          <p className="text-muted-foreground">客户分类和标签管理</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            客户标签功能正在开发中...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">此功能将提供客户标签的创建、管理和分析功能。</p>
        </CardContent>
      </Card>

      {/* 创建/编辑标签对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTag ? "编辑标签" : "创建新标签"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">标签名称</Label>
              <Input id="tag-name" placeholder="输入标签名称..." defaultValue={editingTag?.name || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-description">描述</Label>
              <Textarea
                id="tag-description"
                placeholder="输入标签描述..."
                defaultValue={editingTag?.description || ""}
              />
            </div>
            <div className="space-y-2">
              <Label>标签颜色</Label>
              <div className="flex gap-2">
                {["bg-purple-500", "bg-green-500", "bg-blue-500", "bg-red-500", "bg-yellow-500", "bg-gray-500"].map(
                  (color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full ${color} border-2 border-transparent hover:border-gray-300`}
                    />
                  ),
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-rules">自动化规则</Label>
              <Textarea
                id="tag-rules"
                placeholder="每行一个规则，例如：消费金额 > 1000"
                defaultValue={editingTag?.rules.join("\n") || ""}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>{editingTag ? "保存" : "创建"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
