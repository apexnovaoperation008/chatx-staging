"use client"
import { Megaphone, Send, Users, TrendingUp, Calendar, Target, BarChart3, MessageCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Progress } from "@/components/ui/progress"
import { useLanguage } from "@/contexts/language-context"

export function MarketingToolsView() {
  const { t } = useLanguage()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">{t("marketing.title")}</h1>
          <p className="text-muted-foreground">{t("marketing.subtitle")}</p>
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("marketing.today_sent")}</p>
                <p className="text-2xl font-bold">1,234</p>
              </div>
              <Send className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("marketing.reached_users")}</p>
                <p className="text-2xl font-bold">892</p>
              </div>
              <Users className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("marketing.reply_rate")}</p>
                <p className="text-2xl font-bold">23.5%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("marketing.conversion_rate")}</p>
                <p className="text-2xl font-bold">8.2%</p>
              </div>
              <Target className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快速操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-500" />
              {t("marketing.bulk_message")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{t("marketing.bulk_description")}</p>
            <Button className="w-full">{t("marketing.create_bulk")}</Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              {t("marketing.scheduled_send")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{t("marketing.scheduled_description")}</p>
            <Button variant="outline" className="w-full bg-transparent">
              {t("marketing.set_schedule")}
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              {t("marketing.customer_groups")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{t("marketing.groups_description")}</p>
            <Button variant="outline" className="w-full bg-transparent">
              {t("marketing.manage_groups")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 活动进行中 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {t("marketing.ongoing_activities")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium">春季促销活动</h3>
                  <p className="text-sm text-muted-foreground">新品8折优惠，限时3天</p>
                </div>
                <Badge className="bg-green-500">{t("marketing.in_progress")}</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("marketing.send_progress")}</span>
                  <span>750/1000</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                <span>{t("marketing.start_time")}: 2024-03-15 09:00</span>
                <span>
                  {t("marketing.estimated_completion")}: 2{t("marketing.hours_later")}
                </span>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium">{t("marketing.member_recruitment")}</h3>
                  <p className="text-sm text-muted-foreground">邀请新用户注册送积分</p>
                </div>
                <Badge variant="outline">{t("marketing.paused")}</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("marketing.send_progress")}</span>
                  <span>320/800</span>
                </div>
                <Progress value={40} className="h-2" />
              </div>
              <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                <span>{t("marketing.start_time")}: 2024-03-14 14:00</span>
                <span>{t("marketing.paused")}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 营销效果分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("marketing.send_statistics")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">WhatsApp</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-muted rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: "70%" }}></div>
                  </div>
                  <span className="text-sm font-medium">70%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Telegram</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-muted rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: "30%" }}></div>
                  </div>
                  <span className="text-sm font-medium">30%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              {t("marketing.interaction_data")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t("marketing.open_rate")}</span>
                <span className="font-medium">85.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t("marketing.click_rate")}</span>
                <span className="font-medium">23.5%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t("marketing.reply_rate")}</span>
                <span className="font-medium">12.8%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t("marketing.conversion_rate")}</span>
                <span className="font-medium">8.2%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
