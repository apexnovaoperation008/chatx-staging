/**
 * 添加WhatsApp账号对话框
 * 实现按需生成QR → 扫码 → 确认后才允许添加的完整流程
 */

"use client"

import * as React from "react"
import { 
  Loader2, 
  QrCode, 
  Plus, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  X 
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/contexts/language-context"
import { useToast } from "@/components/ui/use-toast"
import { WaApi } from "@/lib/api"
import { AccountManagementApi, AccountInfo, AccountStats} from "@/lib/account-management-api"
import { SelectTrigger, SelectContent, SelectValue, SelectItem,Select } from "@radix-ui/react-select"
import { Star, Building } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface AddWaAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountAdded?: () => void;
}

export function AddWaAccountDialog({ open, onOpenChange, onAccountAdded }: AddWaAccountDialogProps) {
  const { t } = useLanguage()
  const { toast } = useToast()
  const {user, workspaces, brands, fetchBrands, fetchWorkspaces,getWorkspacesForUser} = useAuth()
  
  // 简化的状态管理
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<"INIT" | "LOADING" | "QR_READY" | "CONNECTED" | "ERROR">("INIT")
  const [qrData, setQrData] = React.useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = React.useState<string>("")
  
  // 表单数据
  const [displayName, setDisplayName] = React.useState('')
  const [description, setDescription] = React.useState('')

  
  // UI状态
  const [isLoading, setIsLoading] = React.useState(false)
  
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null)
  const countdownRef = React.useRef<NodeJS.Timeout | null>(null)

  // State for selected values
  const [workspaceId, setWorkspaceId] = React.useState<number | null>(null)
  const [brandId, setBrandId] = React.useState<number | null>(null)
  const [filteredBrands, setFilteredBrands] = React.useState<any[]>([]);

  // 清理定时器
  const clearTimers = React.useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (workspaceId) {
      const filtered = brands.filter((b) => b.workspace_id === workspaceId);
      setFilteredBrands(filtered);
    } else {
      setFilteredBrands([]);
      setBrandId(null);
    }
  }, [workspaceId, brands]);  

  React.useEffect(() => {
    if(user?.role_id == 2){
      fetchBrands()
      fetchWorkspaces()
    }else{
      getWorkspacesForUser();
    }
  }, []); 


  // 重置状态
  const resetState = React.useCallback(() => {
    setSessionId(null)
    setStatus('INIT')
    setQrData(null)
    setConnectionStatus('')
    setDisplayName('')
    setDescription('')
    setWorkspaceId(null)
    setBrandId(null)
    clearTimers()
  }, [clearTimers])

  // 对话框打开/关闭时重置状态
  React.useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open, resetState])

  // 生成WhatsApp二维码（直接复制已工作的代码）
  const generateQR = async () => {
    console.log("🔵 生成WhatsApp二维码")
    
    // 创建新的AbortController
    const controller = new AbortController()
    
    setIsLoading(true)
    setStatus("LOADING")
    setQrData(null)
    
    try {
      // 阶段1：等待首次QR码生成
      console.log("🔄 等待open-wa启动并生成首次QR码...")
      let firstQrReceived = false
      const maxInitAttempts = 40 // 最多等待40次（约40秒）
      
      // 🆕 新流程：首先创建hash Session ID
      console.log("🆕 Step 1: 创建新的hash Session ID")
      const { sessionId: hashSessionId } = await WaApi.createSession()
      console.log("🎲 生成的hash Session ID:", hashSessionId)
      setSessionId(hashSessionId)
      
      let attempts = 0
      
      // 等待首次QR码
      while (attempts < maxInitAttempts && !controller.signal.aborted && !firstQrReceived) {
        console.log(`⏳ 等待QR码生成 (${attempts + 1}/${maxInitAttempts})`)
        
        try {
          const response = await WaApi.getQr(hashSessionId)
          
          if (controller.signal.aborted) {
            console.log("🚫 WhatsApp QR操作已被取消")
            return
          }
          
          if (response.dataUrl && response.dataUrl.length > 0) {
            console.log("✅ 首次QR码已生成，长度:", response.dataUrl.length)
            setQrData(response.dataUrl)
            setStatus("QR_READY")
            firstQrReceived = true
            
            // 开始轮询连接状态
            startPolling(hashSessionId)
            break
          }
          
          // 等待1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000))
          attempts++
        } catch (error: any) {
          console.log(`⚠️ QR生成尝试失败 (${attempts + 1}):`, error.message)
          attempts++
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
      
      if (!firstQrReceived && !controller.signal.aborted) {
        throw new Error('QR码生成超时，请重试')
      }
      
    } catch (error: any) {
      if (!controller.signal.aborted) {
        console.error("❌ WhatsApp QR生成失败:", error)
        setStatus("ERROR")
        toast({
          title: t("toast.generate_failed"),
          description: `${t("toast.qr_generate_failed")}: ${error.message}`,
          variant: "destructive",
          duration: 3000,
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // 开始轮询状态（复制已工作的逻辑）
  const startPolling = (hashSessionId: string) => {
  console.log("🔄 开始轮询连接状态...");

  const pollController = new AbortController();
  let lastQrData = "";

  const pollLoop = async () => {
    while (!pollController.signal.aborted) {
      try {
        const response = await WaApi.getQr(hashSessionId);

        if (pollController.signal.aborted) break;

        console.log("🔍 检查QR响应:", { hasDataUrl: !!response.dataUrl, length: response.dataUrl?.length || 0 });

        if (response.dataUrl && response.dataUrl.trim().length > 0) {
          // 🌀 QR码有变化时更新
          if (response.dataUrl !== lastQrData) {
            lastQrData = response.dataUrl;
            console.log("🔄 检测到QR码更新，同步到前端，长度:", response.dataUrl.length);
            setQrData(response.dataUrl);
          }

          // 每3秒轮询一次
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          // 🚨 QR为空 -> 检查连接状态
          console.log("🛑 QR码为空，立即检查连接状态...");
          try {
            const statusResponse = await WaApi.getStatus(hashSessionId);
            console.log("📊 检查到会话状态:", statusResponse.status);

            if (statusResponse.status === "READY") {
              console.log("🎉 Step 12: 确认连接成功！停止轮询并更新UI");
              setConnectionStatus("已连接");
              setStatus("CONNECTED");
              setQrData(null);

              // ✅ 自动保存账号
              try {
                const saveResponse = await AccountManagementApi.saveWhatsAppAccount({
                  sessionId: hashSessionId,
                  displayName: displayName.trim() || `WhatsApp ${hashSessionId}`,
                  description: description.trim(),
                  workspaceId: Number(workspaceId),
                  brandId: Number(brandId),
                });

                console.log("📥 保存响应:", saveResponse);

                if (!saveResponse?.ok) {
                  throw new Error(saveResponse?.message || "保存账号失败");
                }

                // ⚠️ 有 warning
                if (saveResponse.warning) {
                  toast({
                    title: t("toast.missing_field"),
                    description: saveResponse.message || t("toast.missing_prompt"),
                    variant: "destructive",
                    duration: 9999999,
                  });
                } else {
                  // ✅ 正常成功
                  toast({
                    title: t("toast.account_added"),
                    description: t("toast.whatsapp_added"),
                    duration: 3000,
                    variant: "success",
                  });
                }

                // ⏳ 延迟关闭对话框并刷新列表
                setTimeout(() => {
                  onOpenChange(false);
                  onAccountAdded?.();
                }, 1500);
              } catch (saveError: any) {
                console.error("❌ 自动保存失败:", saveError);
                toast({
                  title: t("toast.connection_success"),
                  description: t("toast.whatsapp_connected") + " - 请点击添加按钮完成",
                  duration: 3000,
                });
              }

              break; // ✅ 成功后跳出循环
            } else {
              console.log(`⏳ 当前状态: ${statusResponse.status}，继续轮询...`);
            }
          } catch (statusError) {
            console.warn("⚠️ 状态检查失败:", statusError);
          }

          // 再次轮询
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (apiError: any) {
        console.warn("⚠️ QR同步失败:", apiError.message);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 网络错误延迟
      }
    }
  };

  pollLoop();
};


  // 重试
  const handleRetry = async () => {
    setStatus("INIT")
    setQrData(null)
    setConnectionStatus("")
  }

  // 添加账号
  const handleAddAccount = async () => {
    if (!sessionId || status !== "CONNECTED") return;
  
    try {
      setIsLoading(true);
  
      const response = await AccountManagementApi.saveWhatsAppAccount({
        sessionId,
        displayName: displayName.trim() || `WhatsApp ${sessionId}`,
        description: description.trim(),
        workspaceId: Number(workspaceId),
        brandId: Number(brandId),
      });
  
      // If API returns ok === false
      if (!response?.ok) {
        throw new Error(response?.message || "保存账号失败");
      }
      console.log("response", response.warning)
      console.log("response", response.message)
  
      // ⚠️ If backend warns about missing workspaceId or brandId
      if (response.warning) {
        toast({
          title: t("toast.missing_field"),
          description: response.message,
          variant: "destructive", // red style
          duration: 99999999999, // long duration so user won’t miss it
        });
      } else {
        // ✅ Normal success case
        toast({
          title: t("toast.account_added"),
          description: t("toast.whatsapp_added"),
          duration: 3000,
          variant:"success"
        });
      }
  
      console.log("✅ WhatsApp账号已保存到数据库:", sessionId);
  
      // 关闭对话框并刷新
      onOpenChange(false);
      onAccountAdded?.();
  
    } catch (error: any) {
      console.error("添加账号失败:", error);
      toast({
        title: t("toast.save_failed"),
        description: error?.message || String(error),
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };
  

  // 获取状态显示
  const getStatusDisplay = () => {
    switch (status) {
      case "CONNECTED":
        return { text: t("dialog.connection_success"), color: "bg-green-500" }
      case "ERROR":
        return { text: t("dialog.connection_failed"), color: "bg-red-500" }
      case "QR_READY":
        return { text: t("dialog.waiting_scan"), color: "bg-blue-500" }
      case "LOADING":
        return { text: t("dialog.loading"), color: "bg-gray-500" }
      default:
        return { text: t("dialog.please_select_connection"), color: "bg-gray-500" }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] h-[95vh] max-w-none">
        <DialogHeader>
          <DialogTitle>Add WhatsApp Account</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">

          {/* Status Badge */}
          <div className="flex justify-center">
            <Badge className={`${getStatusDisplay().color} text-white px-2 py-1`}>
              {getStatusDisplay().text}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
          {/* Workspace Dropdown */}
            <div className="space-y-2">
              <Label htmlFor="workspace" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Building className="h-4 w-4 text-blue-600" />
                Workspace
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={workspaceId?.toString()}
                onValueChange={(val) => setWorkspaceId(Number(val))}
              >
                <SelectTrigger id="workspace" className="w-full h-10 border-gray-300 hover:border-blue-400 focus:border-blue-500 
              transition-colors bg-white dark:bg-gray-800 
              rounded-lg shadow-sm dark:border-gray-600">
                  <SelectValue placeholder="Select Workspace...">
                    {workspaceId ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                          {
                            workspaces.find((ws) => ws.id === workspaceId)?.name
                              ?.charAt(0)
                              ?.toUpperCase()
                          }
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate items-center justify-center">
                          {workspaces.find((ws) => ws.id === workspaceId)?.name}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 min-w-0">
                        <Building className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Select workspace...</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 
              shadow-lg rounded-lg max-h-60 overflow-y-auto">
                  {workspaces.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                      No workspaces available
                    </div>
                  ) : (
                    workspaces.map((ws) => (
                      <SelectItem 
                        key={ws.id} 
                        value={ws.id.toString()}
                        className="flex items-center gap-3 py-3 px-4 hover:bg-blue-50 dark:hover:bg-blue-900/40 
                    cursor-pointer transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                          {ws.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{ws.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">ID: {ws.id}</span>
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
                Brand
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={brandId?.toString()}
                onValueChange={(val) => setBrandId(Number(val))}
                
              >
                <SelectTrigger className="w-full h-10 border-gray-300 hover:border-blue-400 focus:border-blue-500 
              transition-colors bg-white dark:bg-gray-800 
              rounded-lg shadow-sm dark:border-gray-600">
                  <SelectValue placeholder="Select brand...">
                    {brandId ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {
                            brands.find((b) => b.id === brandId)?.name
                              ?.charAt(0)
                              ?.toUpperCase()
                          }
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate items-center justify-center">
                          {brands.find((b) => b.id === brandId)?.name}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 min-w-0">
                        <Star className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Select brand...</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 
              shadow-lg rounded-lg max-h-60 overflow-y-auto">
                  {filteredBrands.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                      No brands available
                    </div>
                  ) : (
                    filteredBrands.map((b) => (
                      <SelectItem 
                        key={b.id} 
                        value={b.id.toString()}
                        className="flex items-center gap-3 py-3 px-4 hover:bg-blue-50 dark:hover:bg-blue-900/40 
                    cursor-pointer transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold">
                          {b.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{b.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Workspace ID: {b.workspace_id}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Display Name + Description */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name..."
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description..."
                className="min-h-[50px] resize-none"
              />
            </div>
          </div>

          {/* WhatsApp Connection */}
          <Card>
            <CardContent className="p-1 space-y-1">
              <div className="flex justify-center">
                <div className="w-45 h-45 border-2 border-dashed border-muted-foreground rounded-xl flex items-center justify-center bg-muted/20">
                  {connectionStatus === "已连接" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                      <span className="text-sm text-green-600 font-medium">
                        Connected
                      </span>
                    </div>
                  ) : status === "LOADING" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Loading...</span>
                    </div>
                  ) : qrData ? (
                    <img
                      src={qrData}
                      alt="WhatsApp QR"
                      className="w-60 h-60 object-contain"
                    />
                  ) : (
                    <QrCode className="h-16 w-16 text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="text-center space-y-1">
                {connectionStatus === "已连接" ? (
                  <>
                    <p className="text-sm font-medium text-green-600">
                      Connection successful
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Click "Add" to complete
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Scan QR Code</p>
                    <p className="text-xs text-muted-foreground">
                      Use your WhatsApp app to scan the code
                    </p>
                  </>
                )}
              </div>

              {status === "INIT" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={generateQR}
                  disabled={isLoading}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Generate QR
                </Button>
              )}
              {status === "ERROR" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleRetry}
                >
                  Retry
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddAccount}
              disabled={status !== "CONNECTED" || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add
            </Button>
          </div>
      
          {/* Instructions */}
          {qrData && (
            <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
              <p>1. Open WhatsApp on your phone</p>
              <p>2. Go to Settings → Linked Devices</p>
              <p>3. Tap "Link Device" and scan the QR above</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>


  )
}
