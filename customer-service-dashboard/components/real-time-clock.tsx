"use client"

import * as React from "react"
import { Clock, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"

interface TimeSettings {
  timezone: string
  format: "12h" | "24h"
  showSeconds: boolean
  showDate: boolean
}

const defaultTimeSettings: TimeSettings = {
  timezone: "Asia/Kuala_Lumpur",
  format: "24h",
  showSeconds: true,
  showDate: true,
}

// This will be populated with translated labels
const getTimezones = (t: (key: string) => string) => [
  { value: "Asia/Shanghai", label: t("timezone.shanghai"), gmt: "GMT+08:00" },
  { value: "Asia/Kuala_Lumpur", label: t("timezone.kuala_lumpur"), gmt: "GMT+08:00" },
  { value: "Asia/Singapore", label: t("timezone.singapore"), gmt: "GMT+08:00" },
  { value: "Asia/Tokyo", label: t("timezone.tokyo"), gmt: "GMT+09:00" },
  { value: "Asia/Seoul", label: t("timezone.seoul"), gmt: "GMT+09:00" },
  { value: "Australia/Sydney", label: t("timezone.sydney"), gmt: "GMT+11:00" },
  { value: "Europe/London", label: t("timezone.london"), gmt: "GMT+00:00" },
  { value: "Europe/Paris", label: t("timezone.paris"), gmt: "GMT+01:00" },
  { value: "Europe/Berlin", label: t("timezone.berlin"), gmt: "GMT+01:00" },
  { value: "America/New_York", label: t("timezone.new_york"), gmt: "GMT-05:00" },
  { value: "America/Los_Angeles", label: t("timezone.los_angeles"), gmt: "GMT-08:00" },
  { value: "America/Chicago", label: t("timezone.chicago"), gmt: "GMT-06:00" },
]

export function RealTimeClock() {
  const [currentTime, setCurrentTime] = React.useState(new Date())
  const [timeSettings, setTimeSettings] = React.useState<TimeSettings>(defaultTimeSettings)
  const { hasPermission } = useAuth()
  const { language, t } = useLanguage()

  // Get translated timezones
  const timezones = React.useMemo(() => getTimezones(t), [t])

  // 从本地存储加载时间设置
  React.useEffect(() => {
    const savedSettings = localStorage.getItem("timeSettings")
    if (savedSettings) {
      try {
        setTimeSettings(JSON.parse(savedSettings))
      } catch (error) {
        console.error("Failed to parse time settings:", error)
      }
    }
  }, [])

  // 实时更新时间
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // 保存时间设置
  const saveTimeSettings = (newSettings: TimeSettings) => {
    setTimeSettings(newSettings)
    localStorage.setItem("timeSettings", JSON.stringify(newSettings))
  }

  // 格式化时间显示
  const formatTime = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timeSettings.timezone,
      hour12: timeSettings.format === "12h",
      hour: "2-digit",
      minute: "2-digit",
      ...(timeSettings.showSeconds && { second: "2-digit" }),
    }

    const timeString = date.toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", options)

    if (timeSettings.showDate) {
      const dateOptions: Intl.DateTimeFormatOptions = {
        timeZone: timeSettings.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
      const dateString = date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", dateOptions)
      return `${dateString} ${timeString}`
    }

    return timeString
  }

  // 获取时区显示名称
  const getTimezoneLabel = (timezone: string) => {
    const tz = timezones.find((t) => t.value === timezone)
    return tz ? `${tz.label} (${tz.gmt})` : timezone
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">{formatTime(currentTime)}</span>
          <span className="text-xs text-muted-foreground font-medium">
            {timezones.find((t) => t.value === timeSettings.timezone)?.label || "Unknown"}
          </span>
        </div>
      </div>

      {/* 时间设置（仅 Master 可见） */}
      {hasPermission("system.config") && (
        <TooltipProvider>
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="p-3 space-y-3">
                  <div className="font-medium text-sm">{t("time.settings")}</div>

                  {/* 时区选择 */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t("time.timezone")}</label>
                    <select
                      value={timeSettings.timezone}
                      onChange={(e) => saveTimeSettings({ ...timeSettings, timezone: e.target.value })}
                      className="w-full text-xs p-2 border rounded"
                    >
                      {timezones.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label} ({tz.gmt})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 时间格式 */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t("time.format")}</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveTimeSettings({ ...timeSettings, format: "24h" })}
                        className={`flex-1 text-xs p-2 border rounded ${
                          timeSettings.format === "24h" ? "bg-primary text-primary-foreground" : ""
                        }`}
                      >
                        {t("time.24hour")}
                      </button>
                      <button
                        onClick={() => saveTimeSettings({ ...timeSettings, format: "12h" })}
                        className={`flex-1 text-xs p-2 border rounded ${
                          timeSettings.format === "12h" ? "bg-primary text-primary-foreground" : ""
                        }`}
                      >
                        {t("time.12hour")}
                      </button>
                    </div>
                  </div>

                  {/* 显示选项 */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t("time.display_options")}</label>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={timeSettings.showSeconds}
                          onChange={(e) => saveTimeSettings({ ...timeSettings, showSeconds: e.target.checked })}
                          className="w-3 h-3"
                        />
                        {t("time.show_seconds")}
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={timeSettings.showDate}
                          onChange={(e) => saveTimeSettings({ ...timeSettings, showDate: e.target.checked })}
                          className="w-3 h-3"
                        />
                        {t("time.show_date")}
                      </label>
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent>
              <p>{t("tooltip.time_settings")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
