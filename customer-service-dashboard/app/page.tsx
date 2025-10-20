"use client"
import { MainLayout } from "@/components/main-layout"
import { LoginPage } from "@/components/login-page"
import { useAuth } from "@/contexts/auth-context"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function CustomerServiceDashboard() {
  const { isAuthenticated, isLoading } = useAuth()
  const [loginError, setLoginError] = useState("")

  //const isAuthenticated = true

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div>
        {loginError && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-96">
            <Alert variant="destructive" className="animate-in fade-in duration-300">
              <AlertDescription>⚠️ {loginError}</AlertDescription>
            </Alert>
          </div>
        )}
        <LoginPage onLoginError={setLoginError} />
      </div>
    )
  }

  return <MainLayout />
}
