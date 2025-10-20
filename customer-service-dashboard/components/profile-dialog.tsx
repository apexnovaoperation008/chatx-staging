"use client"

import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { User, Mail, Shield, Building } from "lucide-react"

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user } = useAuth()
  const { t } = useLanguage()

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "SUPERADMIN":
        return "bg-red-500"
      case "MANAGER":
        return "bg-blue-500"
      case "SUPERVISOR":
        return "bg-green-500"
      case "AGENT":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("user.profile")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar and Name */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.avatar || "/placeholder.svg"} />
              <AvatarFallback className="text-lg">
                {user?.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{user?.name || "Unknown"}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block w-2 h-2 rounded-full ${getRoleBadgeColor(user?.role || "")}`}></span>
                <span className="text-sm text-muted-foreground">
                  {user?.role || ""}
                </span>
              </div>
            </div>
          </div>

          {/* Profile Information */}
          <div className="space-y-4">
            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t("permissions.name")}
              </Label>
              <Input
                id="name"
                value={user?.name || ""}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {t("permissions.email")}
              </Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ""}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Department/Business Unit Field - Show for all roles except SUPERADMIN */}
            {user?.role !== "SUPERADMIN" && (
              <div className="space-y-2">
                <Label htmlFor="department" className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  {user?.role === "MANAGER" ? (t("permissions.merchant") || "商户") : (t("permissions.department") || "部门")}
                </Label>
                <Input
                  id="department"
                  value={user?.department || ""}
                  disabled
                  className="bg-muted"
                />
              </div>
            )}

            {/* Role Field - Read Only */}
            <div className="space-y-2">
              <Label htmlFor="role" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {t("permissions.role")}
              </Label>
              <div className="relative">
                <Input
                  id="role"
                  value={user?.role || ""}
                  disabled
                  className="bg-muted pr-12"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Badge
                    variant="secondary"
                    className={`text-xs ${getRoleBadgeColor(user?.role || "")} text-white`}
                  >
                    {user?.role || ""}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("profile.role_readonly_description") || "Role is assigned by administrator and cannot be changed"}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
