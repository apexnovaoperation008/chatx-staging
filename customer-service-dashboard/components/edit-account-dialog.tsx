"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building, Star } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useLanguage } from "@/contexts/language-context"
import { useAuth } from "@/contexts/auth-context"
import { AccountInfo, AccountManagementApi } from "@/lib/account-management-api"

interface EditAccountDialogProps {
  account: AccountInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccountUpdated: () => void
}

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
  onAccountUpdated,
}: EditAccountDialogProps) {
  const { toast } = useToast()
  const { user, workspaces, brands, fetchBrands, fetchWorkspaces, getWorkspacesForUser } = useAuth()
  const { t } = useLanguage()

  const [displayName, setDisplayName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [workspaceId, setWorkspaceId] = React.useState<number | null>(null)
  const [brandId, setBrandId] = React.useState<number | null>(null)
  const [filteredBrands, setFilteredBrands] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  // 🔹 Filter brands based on workspace
  React.useEffect(() => {
    if (workspaceId) {
      const filtered = brands.filter((b) => b.workspace_id === workspaceId)
      setFilteredBrands(filtered)
    } else {
      setFilteredBrands([])
      setBrandId(null)
    }
  }, [workspaceId, brands])

  // 🔹 Fetch data depending on user role
  React.useEffect(() => {
    if (user?.role_id === 2) {
      fetchBrands()
      fetchWorkspaces()
    } else {
      getWorkspacesForUser()
    }
  }, [])

  // 🔹 When editing account, prefill the form
  React.useEffect(() => {
    if (account) {
      setDisplayName(account.displayName || "")
      setDescription(account.description || "")
      setWorkspaceId(account.workspaceId ? Number(account.workspaceId) : null)
      setBrandId(account.brandId ? Number(account.brandId) : null)
    }
  }, [account])

  const handleSave = async () => {
    if (!account) return
    try {
      setIsLoading(true)
      console.log("🔄 更新账号信息:", {
        id: account.id,
        displayName,
        description,
        workspaceId,
        brandId,
      })

      const success = await AccountManagementApi.updateAccountInfo(
        account.id,
        displayName.trim(),
        description.trim(),
        Number(workspaceId),
        Number(brandId)
      )

      if (!success) throw new Error("更新失败")

      toast({
        title: t("common.success"),
        description: "账号信息更新成功",
        duration: 3000,
      })
      onAccountUpdated()
      onOpenChange(false)
    } catch (error) {
      console.error("❌ 更新账号信息失败:", error)
      toast({
        title: t("common.error"),
        description: "更新账号信息失败",
        variant: "destructive",
        duration: 3000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (account) {
      setDisplayName(account.displayName || "")
      setDescription(account.description || "")
      setWorkspaceId(account.workspaceId ? Number(account.workspaceId) : null)
      setBrandId(account.brandId ? Number(account.brandId) : null)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("account.edit_account")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>{t("dialog.display_name")}</Label>
            <Input
              placeholder={t("dialog.display_name") + "..."}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Workspace + Brand Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Workspace Dropdown */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Building className="h-4 w-4 text-blue-600" />
                Workspace <span className="text-red-500">*</span>
              </Label>
              <Select
                value={workspaceId?.toString() ?? ""}
                onValueChange={(val) => setWorkspaceId(Number(val))}
              >
                <SelectTrigger className="w-full h-10 border-gray-300 hover:border-blue-400 focus:border-blue-500 transition-colors bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:border-gray-600">
                  <SelectValue placeholder="Select workspace..." />
                </SelectTrigger>
                <SelectContent className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg rounded-lg max-h-60 overflow-y-auto">
                  {workspaces.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      No workspaces available
                    </div>
                  ) : (
                    workspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id.toString()}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                            {ws.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{ws.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">ID: {ws.id}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Brand Dropdown */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Brand <span className="text-red-500">*</span>
              </Label>
              <Select
                value={brandId?.toString() ?? ""}
                onValueChange={(val) => setBrandId(Number(val))}
                disabled={!workspaceId}
              >
                <SelectTrigger className="w-full h-10 border-gray-300 hover:border-blue-400 focus:border-blue-500 transition-colors bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:border-gray-600">
                  <SelectValue placeholder="Select brand..." />
                </SelectTrigger>
                <SelectContent className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg rounded-lg max-h-60 overflow-y-auto">
                  {filteredBrands.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      No brands available
                    </div>
                  ) : (
                    filteredBrands.map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold">
                            {b.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{b.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Workspace ID: {b.workspace_id}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("dialog.description")}</Label>
            <Textarea
              placeholder={t("dialog.description") + "..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
