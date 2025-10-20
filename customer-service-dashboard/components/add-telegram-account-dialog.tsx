"use client"

import * as React from "react"
import { Plus, MessageSquare, QrCode, Phone, CheckCircle, Loader2, XCircle, Eye, EyeOff } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { WaApi, TgApi } from "@/lib/api"
import { QRErrorBoundary } from "@/components/qr-error-boundary"
import BigQR from "@/components/BigQR"
import { useToast } from "@/components/ui/use-toast"
import { AccountManagementApi } from "@/lib/account-management-api"
import { useLanguage } from "@/contexts/language-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { SelectTrigger, SelectContent, SelectValue, SelectItem,Select } from "@radix-ui/react-select"
import { Star, Building } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface AddTelegramAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccountAdded?: () => void
}

export function AddTelegramAccountDialog({ open, onOpenChange, onAccountAdded }: AddTelegramAccountDialogProps) {
  const { toast } = useToast()
  const { t } = useLanguage()
  const {user, workspaces, brands, fetchBrands, fetchWorkspaces, getWorkspacesForUser} = useAuth()
  
  // Telegram登录方式 - 只支持手机号验证
  const [telegramLoginMethod, setTelegramLoginMethod] = React.useState<"qr" | "phone">("phone")
  const [phoneNumber, setPhoneNumber] = React.useState("")
  const [verificationCode, setVerificationCode] = React.useState("")
  const [showVerificationStep, setShowVerificationStep] = React.useState(false)
  const [twoFAPassword, setTwoFAPassword] = React.useState("")
  const [showTwoFAStep, setShowTwoFAStep] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [loginKey, setLoginKey] = React.useState<string | null>(null)
  const [txId, setTxId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState("INIT")
  const [tgQrImage, setTgQrImage] = React.useState<string | null>(null)
  
  // 🆕 连接成功后的状态
  const [connectionStatus, setConnectionStatus] = React.useState<string>("")
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null)

  // State for selected values
  const [workspaceId, setWorkspaceId] = React.useState<number | null>(null)
  const [brandId, setBrandId] = React.useState<number | null>(null)
  
  // 账号信息
  const [accountName, setAccountName] = React.useState("")
  const [accountDescription, setAccountDescription] = React.useState("")
  const [filteredBrands, setFilteredBrands] = React.useState<any[]>([]);
  
  const abortControllerRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    if(user?.role_id == 2){
      fetchBrands()
      fetchWorkspaces()
    }else{
      getWorkspacesForUser();
    }
  }, []); 

  React.useEffect(() => {
    if (workspaceId) {
      const filtered = brands.filter((b) => b.workspace_id === workspaceId);
      setFilteredBrands(filtered);
    } else {
      setFilteredBrands([]);
      setBrandId(null);
    }
  }, [workspaceId, brands]);

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    
    // 重置状态
    if (!newOpen) {
      // 🗑️ 清理未保存的session
      if (currentSessionId && connectionStatus !== "已连接") {
        console.log(`🗑️ 用户取消，清理未保存的Session: ${currentSessionId}`)
      }
      
      setTelegramLoginMethod("phone")
      setShowVerificationStep(false)
      setWorkspaceId(null)
      setBrandId(null)
      setPhoneNumber("")
      setVerificationCode("")
      setQrCodeUrl(null)
      setIsLoading(false)
      setLoginKey(null)
      setTxId(null)
      setStatus("INIT")
      setConnectionStatus("")
      setAccountName("")
      setAccountDescription("")
      setCurrentSessionId(null)
      setTwoFAPassword("")
      setShowTwoFAStep(false)
      setShowPassword(false)
      setTgQrImage(null)
      
      // 取消正在进行的操作
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }

  // 生成Telegram二维码（复制已工作的逻辑）
  const generateTelegramQR = async () => {
    console.log("🔵 生成Telegram二维码")
    
    // 创建新的AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    setIsLoading(true)
    setStatus("LOADING")
    setQrCodeUrl(null)
    setTgQrImage(null)
    
    try {
      console.log("🔄 启动Telegram QR登录...")
      const response = await TgApi.startQr()
      
      // 检查是否被取消
      if (controller.signal.aborted) {
        console.log("🚫 Telegram QR操作已被取消")
        return
      }
      
      console.log("✅ Telegram QR启动成功:", response)
      setLoginKey(response.loginKey)
      
      if (response.qrImage) {
        console.log("📱 使用server端生成的QR图片")
        setTgQrImage(response.qrImage)
      } else {
        console.log("📱 使用前端生成QR码:", response.qrPayload)
        setQrCodeUrl(response.qrPayload)
      }
      
      setStatus("PENDING_SCAN")
      
      // 开始轮询Telegram状态
      pollTelegramStatus(response.loginKey, controller)
      
    } catch (error: any) {
      if (!controller.signal.aborted) {
        console.error("❌ Telegram QR生成失败:", error)
        setStatus("ERROR")
        toast({
          title: t("toast.generate_failed"),
          description: `${t("toast.qr_generate_failed")}: ${error}`,
          variant: "destructive",
          duration: 3000,
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // 轮询Telegram状态（复制已工作的逻辑）
  const pollTelegramStatus = async (loginKey: string, controller: AbortController) => {
    console.log("🔄 开始轮询Telegram状态:", loginKey)
    let pollCount = 0
    const maxPolls = 150 // 最多轮询150次（约5分钟）
    
    while (pollCount < maxPolls && !controller.signal.aborted) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        if (controller.signal.aborted) {
          console.log("🚫 Telegram轮询被取消")
          break
        }
        
        pollCount++
        console.log(`🔍 Telegram轮询第${pollCount}次，loginKey: ${loginKey}`)
        
        const pollResult = await TgApi.poll(loginKey)
        console.log("📊 Telegram轮询结果:", pollResult)
        
        if (pollResult.ok) {
          console.log("✅ Telegram登录成功！停止轮询")
          setStatus("READY")
          setConnectionStatus("已连接")
          
          toast({
            title: t("toast.connection_success"),
            description: t("toast.telegram_connected"),
            duration: 3000,
          })
          
          // 立即停止轮询
          break
        }
        
        // 检查是否是token已清理的情况
        if (pollResult && 'error' in pollResult && pollResult.error === "TOKEN_NOT_FOUND") {
          console.log("🛑 Telegram登录已完成或token已清理，停止轮询")
          setStatus("READY")
          setConnectionStatus("已连接")
          return
        }
        
      } catch (pollError: any) {
        pollCount++
        console.log(`⚠️ Telegram轮询失败 (第${pollCount}次):`, pollError.message)
        
        if (pollCount >= 10) {
          console.log("❌ Telegram轮询失败次数过多，停止轮询")
          setStatus("ERROR")
          break
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }
    
    if (pollCount >= maxPolls) {
      console.log("⏰ Telegram轮询超时")
      setStatus("ERROR")
    }
  }

  // 发送验证码
  const handleSendVerificationCode = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: t("toast.input_error"),
        description: t("toast.phone_required"),
        variant: "destructive",
        duration: 3000,
      })
      return
    }
    
    console.log("🔵 发送Telegram验证码到:", phoneNumber)
    
    // 创建新的AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    setIsLoading(true)
    setStatus("LOADING")
    
    try {
      const response = await TgApi.startPhone(phoneNumber)
      
      // 检查是否被取消
      if (controller.signal.aborted) {
        console.log("🚫 Telegram手机号操作已被取消")
        return
      }
      
      console.log("✅ 验证码发送成功:", response)
      setTxId(response.txId)
      setShowVerificationStep(true)
      setStatus("CODE_SENT")
    } catch (error: any) {
      if (!controller.signal.aborted) {
        console.error("❌ 发送验证码失败:", error)
        setStatus("ERROR")
        toast({
          title: t("toast.send_failed"),
          description: `${t("toast.code_send_failed")}: ${error}`,
          variant: "destructive",
          duration: 3000,
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

//   const handleVerifyCode = async () => {
//   if (!verificationCode.trim()) {
//     toast({
//       title: t("toast.input_error"),
//       description: t("toast.code_required"),
//       variant: "destructive",
//       duration: 3000,
//     });
//     return;
//   }
//   if (!txId) {
//     toast({
//       title: t("toast.system_error"),
//       description: t("toast.missing_tx_id"),
//       variant: "destructive",
//       duration: 3000,
//     });
//     return;
//   }

//   // if (!workspaceId || !brandId) {
//   //   toast({
//   //     title: t("toast.input_error"),
//   //     description: "Workspace and Brand are required",
//   //     variant: "destructive",
//   //     duration: 3000,
//   //   });
//   //   return;
//   // }

//   console.log("🔵 验证Telegram验证码:", verificationCode);
//   setIsLoading(true);
//   try {
//     // ✅ Send displayName and description together
//     const result = await TgApi.verifyPhone(
//       txId,
//       verificationCode,
//       twoFAPassword,
//       workspaceId || undefined,
//       brandId || undefined,
//       accountDescription || "",
//       accountName || ""
//     );
    
    

//     console.log("✅ 验证码验证成功, 账号已保存");
//     setConnectionStatus("已连接");
//     setStatus("READY");

//     toast({
//       title: t("toast.connection_success"),
//       description: t("toast.telegram_connected"),
//       duration: 3000,
//     });

//     // Close dialog and call callback
//     onOpenChange(false);
//     onAccountAdded?.();
//   } catch (error: any) {
//     console.error("❌ 验证码验证失败:", error);

//     if (error.message?.includes("TG_2FA_REQUIRED")) {
//       setShowTwoFAStep(true);
//       toast({
//         title: t("toast.two_fa_required"),
//         description: t("toast.two_fa_prompt"),
//         duration: 3000,
//       });
//     } else {
//       toast({
//         title: t("toast.verify_failed"),
//         description: `${t("toast.verification_failed")}: ${error}`,
//         variant: "destructive",
//         duration: 3000,
//       });
//     }
//   } finally {
//     setIsLoading(false);
//   }
// };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast({
        title: t("toast.input_error"),
        description: t("toast.code_required"),
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (!txId) {
      toast({
        title: t("toast.system_error"),
        description: t("toast.missing_tx_id"),
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    console.log("🔵 验证Telegram验证码:", verificationCode);
    setIsLoading(true);
    try {
      const result = await TgApi.verifyPhone(
        txId,
        verificationCode,
        twoFAPassword,
        workspaceId || undefined,
        brandId || undefined,
        accountDescription || "",
        accountName || ""
      );

      if (!result?.ok) {
        throw new Error(result?.message || "保存账号失败");
      }
      console.log("response", result.warning)
      console.log("response", result.message)
  
      // ⚠️ If backend warns about missing workspaceId or brandId
      if (result.warning) {
        toast({
          title: t("toast.missing_field"),
          description: result.message,
          variant: "destructive", // red style
          duration: 99999999999, // long duration so user won’t miss it
        });
      } else {
        // ✅ Normal success case
        setConnectionStatus("已连接");
        setStatus("READY");
        toast({
          title: t("toast.account_added"),
          description: t("toast.telegram_added"),
          duration: 3000,
          variant:"success"
        });
      }
  
      console.log("✅ Telgram账号已保存到数据库:")
      setTelegramLoginMethod("phone")
      setShowVerificationStep(false)
      setWorkspaceId(null)
      setBrandId(null)
      setPhoneNumber("")
      setVerificationCode("")
      setQrCodeUrl(null)
      setIsLoading(false)
      setLoginKey(null)
      setTxId(null)
      setStatus("INIT")
      setConnectionStatus("")
      setAccountName("")
      setAccountDescription("")
      setCurrentSessionId(null)
      setTwoFAPassword("")
      setShowTwoFAStep(false)
      setShowPassword(false)
      setTgQrImage(null)
      onOpenChange(false);
      onAccountAdded?.();
    } catch (error: any) {
      console.error("❌ 验证码验证失败:", error);

      const message =
        error?.message ||
        error?.response?.data?.message ||
        t("toast.verification_failed");

      if (message.includes("TG_2FA_REQUIRED")) {
        setShowTwoFAStep(true);
        toast({
          title: t("toast.two_fa_required"),
          description: t("toast.two_fa_prompt"),
          duration: 3000,
        });
      } else {
        toast({
          title: t("toast.verify_failed"),
          description: message,
          variant: "destructive",
          duration: 3000,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 2FA验证
  const handleVerifyTwoFA = async () => {
    if (!twoFAPassword.trim()) {
      toast({
        title: t("toast.input_error"),
        description: t("toast.password_required"),
        variant: "destructive",
        duration: 3000,
      })
      return
    }
    if (!txId) {
      toast({
        title: t("toast.system_error"),
        description: t("toast.missing_tx_id"),
        variant: "destructive",
        duration: 3000,
      })
      return
    }

    console.log("🔐 验证Telegram 2FA密码")
    setIsLoading(true)
    try {
      await TgApi.verifyPhone(txId, verificationCode, twoFAPassword)
      console.log("✅ 2FA验证成功")
      setConnectionStatus("已连接")
      setStatus("READY")
      
      toast({
        title: t("toast.connection_success"),
        description: t("toast.telegram_connected"),
        duration: 3000,
      })
    } catch (error: any) {
      console.error("❌ 2FA验证失败:", error)
      
      let errorMessage = `${t("toast.verification_failed")}: ${error}`;
      if (error.message && error.message.includes('TG_PASSWORD_INVALID')) {
        errorMessage = t("toast.password_invalid");
      }
      
      toast({
        title: t("toast.verify_failed"),
        description: errorMessage,
        variant: "destructive",
        duration: 3000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 保存账号
  const handleSaveAccount = async () => {
    try {
      setIsLoading(true)

      const sessionId = (currentSessionId || loginKey || txId || "").toString()
      if (!sessionId) {
        throw new Error("Missing session id for Telegram account")
      }
      if (!workspaceId || !brandId) {
        throw new Error("Workspace and Brand are required")
      }

      const payload = {
        sessionId,
        displayName: (accountName || "").trim() || `Telegram ${sessionId}`,
        description: (accountDescription || "").trim(),
        workspaceId: Number(workspaceId),
        brandId: Number(brandId),
      };

      console.log("📤 调用后端保存Telegram账号:", payload)
      await AccountManagementApi.saveTelegramAccount(payload)
      console.log("✅ Telegram账号保存成功")

      toast({
        title: t("toast.account_added"),
        description: t("toast.telegram_added"),
        duration: 3000,
      })

      onOpenChange(false)
      onAccountAdded?.()
    } catch (error: any) {
      console.error("❌ 保存账号失败:", error)
      toast({
        title: t("toast.save_failed"),
        description: `${t("toast.save_failed")}: ${error?.message || error}`,
        variant: "destructive",
        duration: 3000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const clearQRSession = () => {
    setStatus("INIT")
    setQrCodeUrl(null)
    setTgQrImage(null)
    setLoginKey(null)
    setConnectionStatus("")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] h-[95vh] max-w-none">
        <DialogHeader>
          <DialogTitle>{t('account.add_telegram')}</DialogTitle>
        </DialogHeader>
        
        {/* 状态指示器 */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium bg-gray-50">
            {connectionStatus === "已连接" && (
              <>
                <CheckCircle className="h-2 w-2 text-green-600" />
                <span className="text-green-600">{t("dialog.connection_success")}</span>
              </>
            )}
            {connectionStatus === "连接中" && (
              <>
                <Loader2 className="h-2 w-2 animate-spin text-blue-600" />
                <span className="text-blue-600">{t("dialog.connecting")}</span>
              </>
            )}
            {status === "LOADING" && !connectionStatus && (
              <>
                <Loader2 className="h-2 w-2 animate-spin text-gray-600" />
                <span className="text-gray-600">{t("dialog.loading")}</span>
              </>
            )}
            {status === "PENDING_SCAN" && !connectionStatus && (
              <>
                <QrCode className="h-2 w-2 text-blue-600" />
                <span className="text-blue-600">{t("dialog.waiting_scan")}</span>
              </>
            )}
            {status === "CODE_SENT" && (
              <>
                <MessageSquare className="h-2 w-2 text-blue-600" />
                <span className="text-blue-600">{t("dialog.code_sent_to")}</span>
              </>
            )}
            {status === "ERROR" && (
              <>
                <XCircle className="h-2 w-2 text-red-600" />
                <span className="text-red-600">{t("dialog.connection_failed")}</span>
              </>
            )}
            {status === "INIT" && !connectionStatus && (
              <span className="text-gray-500">{t("dialog.please_select_connection")}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Workspace Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="workspace" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Building className="h-3 w-3 text-blue-600" />
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
              <Star className="h-3 w-3 text-amber-500" />
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
        
        <div className="space-y-2">
          {/* 表单区域 */}
          <div className="space-y-1">
            <div className="space-y-1">
              <Label htmlFor="display-name">{t("dialog.display_name")}</Label>
              <Input 
                id="display-name" 
                placeholder={t("dialog.display_name") + "..."} 
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">{t("dialog.description")}</Label>
              <Textarea 
                id="description" 
                placeholder={t("dialog.description") + "..."} 
                value={accountDescription}
                onChange={(e) => setAccountDescription(e.target.value)}
                className="min-h-[40px] resize-none"
              />
            </div>
          </div>

          {/* Telegram 连接设置 */}
          <div className="space-y-2">
            {/* QR码选项已注释掉，只保留手机号验证 */}
            {/* {telegramLoginMethod === "qr" ? (
              <Card>
                <CardContent className="p-2">
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="w-40 h-40 border-2 border-dashed border-muted-foreground rounded-lg flex items-center justify-center">
                        {connectionStatus === "已连接" ? (
                          // 🎉 连接成功显示
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                              <CheckCircle className="h-8 w-8 text-green-600" />
                            </div>
                            <span className="text-sm text-green-600 font-medium">{t("dialog.connection_success")}</span>
                          </div>
                        ) : status === "LOADING" ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span className="text-xs text-gray-500">{t("dialog.loading")}...</span>
                          </div>
                        ) : tgQrImage ? (
                          <img src={tgQrImage} alt="Telegram QR" className="w-54 h-54 object-contain" />
                        ) : qrCodeUrl ? (
                          <div className="p-1">
                            <QRErrorBoundary>
                              <BigQR value={qrCodeUrl} size={240} />
                            </QRErrorBoundary>
                          </div>
                        ) : (
                          <QrCode className="h-10 w-10 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div>
                      {connectionStatus === "已连接" ? (
                        <>
                          <p className="text-sm font-medium text-green-600">{t("dialog.connection_success")}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t("dialog.click_add_to_complete")}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium">{t("dialog.scan_qr")}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t("dialog.scan_with_telegram")}</p>
                        </>
                      )}
                    </div>
                    
                    {status === "INIT" ? (
                      <Button 
                        variant="outline" 
                        className="w-full bg-transparent" 
                        onClick={generateTelegramQR}
                        disabled={isLoading}
                      >
                        <MessageSquare className="h-2 w-2 mr-2" />
                        {t("dialog.generate_qr")}
                      </Button>
                    ) : status === "PENDING_SCAN" ? (
                      <div className="space-y-2">
                        <div className="text-xs text-green-600 text-center">
                          📱 {t("dialog.scan_with_telegram")}
                        </div>
                        <Button 
                          variant="outline" 
                          className="w-full bg-transparent" 
                          onClick={clearQRSession}
                        >
                          {t("dialog.regenerate")}
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="w-full bg-transparent" 
                        onClick={clearQRSession}
                      >
                        {t("dialog.retry")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : ( */}
              <Card>
                <CardContent className="p-2 space-y-2">
                  <div className="text-center">
                    <p className="text-sm font-medium">{t("dialog.phone_login")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("dialog.phone_number")} {t("dialog.code_sent_to")}</p>
                  </div>

                  {!showVerificationStep && !showTwoFAStep ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="phone-number">{t("dialog.phone_number")}</Label>
                        <Input
                          id="phone-number"
                          placeholder={t("dialog.phone_placeholder")}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        className="w-full bg-transparent"
                        onClick={handleSendVerificationCode}
                        disabled={isLoading}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        {isLoading ? t("dialog.sending") : t("dialog.send_code")}
                      </Button>
                    </div>
                  ) : showVerificationStep && !showTwoFAStep ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="verification-code">{t("dialog.verification_code")}</Label>
                        <Input
                          id="verification-code"
                          placeholder={t("dialog.code_placeholder")}
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground text-center">{t("dialog.code_sent_to")} {phoneNumber}</div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 bg-transparent"
                          onClick={() => {
                            setShowVerificationStep(false)
                            setVerificationCode("")
                            setTxId(null)
                          }}
                          disabled={isLoading}
                        >
                          {t("dialog.resend")}
                        </Button>
                        <Button 
                          className="flex-1" 
                          onClick={handleVerifyCode}
                          disabled={isLoading || !verificationCode.trim()}
                        >
                          {isLoading ? t("dialog.verifying") : t("dialog.verify")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="two-fa-password">{t("dialog.two_fa_password")}</Label>
                        <div className="relative">
                          <Input
                            id="two-fa-password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("dialog.two_fa_placeholder")}
                            value={twoFAPassword}
                            onChange={(e) => setTwoFAPassword(e.target.value)}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">{t("dialog.two_fa_required")}</div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 bg-transparent"
                          onClick={() => {
                            setShowTwoFAStep(false)
                            setShowVerificationStep(false)
                            setTwoFAPassword("")
                            setVerificationCode("")
                            setTxId(null)
                          }}
                          disabled={isLoading}
                        >
                          {t("dialog.restart")}
                        </Button>
                        <Button 
                          className="flex-1" 
                          onClick={handleVerifyTwoFA}
                          disabled={isLoading || !twoFAPassword.trim()}
                        >
                          {isLoading ? t("dialog.password_verifying") : t("dialog.verify_password")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            {/* )} */}

            {/* Telegram 登录方式切换 - 已注释，只支持手机号验证 */}
            {/* <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTelegramLoginMethod(telegramLoginMethod === "qr" ? "phone" : "qr")}
                className="py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {telegramLoginMethod === "qr" ? t("dialog.use_phone") : t("dialog.use_qr")}
              </Button>
            </div> */}
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-1 pt-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("dialog.cancel")}
            </Button>
            <Button 
              onClick={handleSaveAccount}
              disabled={connectionStatus !== "已连接" && status !== "READY"}
              className={connectionStatus === "已连接" || status === "READY" ? "" : "opacity-50 cursor-not-allowed"}
            >
              {t("dialog.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
