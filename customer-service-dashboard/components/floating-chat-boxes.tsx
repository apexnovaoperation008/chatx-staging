"use client"

import * as React from "react"
import { X, Minus, Maximize2 } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

interface FloatingChat {
  id: string
  name: string
  avatar: string
  platform: "whatsapp" | "telegram"
  isMinimized: boolean
  unreadCount: number
  messages: Array<{
    id: string
    content: string
    isOwn: boolean
    time: string
  }>
}

const initialChats: FloatingChat[] = [
  {
    id: "1",
    name: "客户支持",
    avatar: "/placeholder.svg?height=32&width=32&text=客服",
    platform: "whatsapp",
    isMinimized: false,
    unreadCount: 3,
    messages: [
      { id: "1", content: "你好，我需要帮助", isOwn: false, time: "14:30" },
      { id: "2", content: "好的，我来帮您解决", isOwn: true, time: "14:31" },
      { id: "3", content: "谢谢！", isOwn: false, time: "14:32" },
    ],
  },
  {
    id: "2",
    name: "李小红",
    avatar: "/placeholder.svg?height=32&width=32&text=李",
    platform: "telegram",
    isMinimized: true,
    unreadCount: 1,
    messages: [{ id: "1", content: "产品什么时候上线？", isOwn: false, time: "15:20" }],
  },
]

export function FloatingChatBoxes() {
  const [chats, setChats] = React.useState<FloatingChat[]>(initialChats)

  const toggleMinimize = (chatId: string) => {
    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, isMinimized: !chat.isMinimized } : chat)))
  }

  const closeChat = (chatId: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== chatId))
  }

  const sendMessage = (chatId: string, content: string) => {
    if (!content.trim()) return

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: Date.now().toString(),
                  content,
                  isOwn: true,
                  time: new Date().toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
              ],
            }
          : chat,
      ),
    )
  }

  const getPlatformIcon = (platform: string) => {
    if (platform === "whatsapp") {
      return (
        <div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">W</span>
        </div>
      )
    }
    return (
      <div className="w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
        <span className="text-white text-xs font-bold">T</span>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 flex flex-col-reverse gap-2 z-50">
      {chats.map((chat) => (
        <Card key={chat.id} className="w-80 shadow-lg">
          <CardHeader className="p-3 bg-primary text-primary-foreground">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={chat.avatar || "/placeholder.svg"} />
                  <AvatarFallback className="text-xs">{chat.name[0]}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">{chat.name}</span>
                {getPlatformIcon(chat.platform)}
                {chat.unreadCount > 0 && (
                  <Badge className="bg-red-500 text-white text-xs h-4 min-w-[16px] flex items-center justify-center">
                    {chat.unreadCount}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={() => toggleMinimize(chat.id)}
                >
                  {chat.isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={() => closeChat(chat.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>

          {!chat.isMinimized && (
            <CardContent className="p-0">
              {/* 消息区域 */}
              <div className="h-64 overflow-y-auto p-3 space-y-2">
                {chat.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.isOwn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] p-2 rounded-lg text-sm ${
                        message.isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      <p>{message.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          message.isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {message.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 输入区域 */}
              <div className="p-3 border-t">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement
                    sendMessage(chat.id, input.value)
                    input.value = ""
                  }}
                >
                  <div className="flex gap-2">
                    <Input name="message" placeholder="输入消息..." className="flex-1 h-8 text-sm" />
                    <Button type="submit" size="sm" className="h-8">
                      发送
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}
