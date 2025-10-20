"use client"

import * as React from "react"
import { useState } from "react"
import { Eye, EyeOff, MessageSquare, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageToggle } from "@/components/language-toggle"
import ConnectModalSimple from "@/components/connect-modal-simple"

interface LoginPageProps {
  onLoginError?: (error: string) => void
}

export function LoginPage({ onLoginError }: LoginPageProps) {
  console.log("🔄 LoginPage component rendered")
  
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const { login, isLoading, isAuthenticated } = useAuth()
  const { t } = useLanguage()
  
  console.log("🔄 LoginPage state:", { email, password, isLoading, isAuthenticated })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("🚀 Form submitted")
    onLoginError?.("") // Clear any previous errors
    console.log("🧹 Cleared previous errors")

    if (!email || !password) {
      console.log("❌ Empty fields, setting error")
      onLoginError?.(t("login.error_empty"))
      return
    }

    console.log("📡 Calling login function...")
    const result = await login(email, password)
    console.log("🔍 Login result:", result)
    
    if (!result) {
      console.log("⚠️ Login failed, setting error.")
      const errorMessage = t("login.error_invalid")
      console.log("🔍 About to set error to:", errorMessage)
      onLoginError?.(errorMessage)
      console.log("✅ Error set via callback")
      
      // Auto-hide error after 5 seconds
      setTimeout(() => {
        console.log("🕐 Clearing error after 5 seconds")
        onLoginError?.("")
      }, 5000)
    } else {
      console.log("✅ Login successful")
      onLoginError?.("")
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      {/* 右上角控制按钮 */}
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex aspect-square size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="size-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("login.email_placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("login.password_placeholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("login.logging_in")}
                </>
              ) : (
                t("login.button")
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("login.or_separator")}</span>
              </div>
            </div>

            <button
              type="button"
              className="w-full rounded border px-4 py-2 hover:bg-gray-50"
              onClick={() => setShowConnectModal(true)}
              disabled={isLoading}
            >
              {t("dialog.add_account")}
            </button>
          </div>
          
        </CardContent>
      </Card>

      <ConnectModalSimple
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />
    </div>
  )
}
