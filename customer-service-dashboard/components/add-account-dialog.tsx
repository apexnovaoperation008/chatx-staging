"use client"

import * as React from "react"
import { Plus, Smartphone, MessageSquare, QrCode, Phone, CheckCircle, Loader2, XCircle, Eye, EyeOff, Building, Star } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { WaApi, TgApi } from "@/lib/api"
import { AccountManagementApi } from "@/lib/account-management-api"
import { QRErrorBoundary } from "@/components/qr-error-boundary"
import BigQR from "@/components/BigQR"
import { useToast } from "@/components/ui/use-toast"
import { useLanguage } from "@/contexts/language-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"

interface AddAccountDialogProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AddAccountDialog({ trigger, open, onOpenChange }: AddAccountDialogProps) {
  const { toast } = useToast()
  const { t } = useLanguage()
  const {user, workspaces, brands, fetchBrands, fetchWorkspaces, getWorkspacesForUser} = useAuth()

  const [selectedPlatform, setSelectedPlatform] = React.useState<"whatsapp" | "telegram">("whatsapp")
  const [telegramLoginMethod, setTelegramLoginMethod] = React.useState<"qr" | "phone">("phone")
  const [isOpen, setIsOpen] = React.useState(false)
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
  
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const [filteredBrands, setFilteredBrands] = React.useState<any[]>([]);

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
    if (onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setIsOpen(newOpen)
    }

      // 重置状态
      if (!newOpen) {
        // 🗑️ Step 14: 清理未保存的session
        if (currentSessionId && connectionStatus !== "已连接") {
          console.log(`🗑️ Step 14: 用户取消，清理未保存的Session: ${currentSessionId}`)
          cleanupUnusedSession(currentSessionId)
        }
        
        setTelegramLoginMethod("phone") // Telegram 始终使用手机号验证
        setShowVerificationStep(false)
      setPhoneNumber("")
      setVerificationCode("")
      setQrCodeUrl(null)
      setIsLoading(false)
      setLoginKey(null)
      setTxId(null)
      setStatus("INIT")
      setAccountName("")
      setAccountDescription("")
      setWorkspaceId(null)
      setBrandId(null)
      setConnectionStatus("")
      setCurrentSessionId(null)
    }
  }
  
  // 🗑️ 清理未使用的Session
  const cleanupUnusedSession = async (sessionId: string) => {
    try {
      console.log(`🧹 清理未使用的Session: ${sessionId}`)
      // TODO: 后续可以添加后端删除session API
      // await WaApi.deleteSession(sessionId)
    } catch (error) {
      console.log(`⚠️ Session清理失败: ${sessionId}`, error)
    }
  }

  const currentOpen = open !== undefined ? open : isOpen

  // 清理QR会话的函数
  const clearQRSession = () => {
    console.log("🧹 清理QR会话")
    
    // 取消当前进行的异步操作
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // 分步清理，避免一次性更新过多状态
    setIsLoading(false)
    setStatus("INIT")
    
    // 延迟清理大数据（QR码）
    setTimeout(() => {
      setQrCodeUrl(null)
      setTgQrImage(null)
    }, 10)
    
    // 再延迟清理其他状态
    setTimeout(() => {
      setLoginKey(null)
      setTxId(null)
      setShowVerificationStep(false)
      setPhoneNumber("")
      setVerificationCode("")
    }, 20)
  }

  // 监听平台切换，立即清理QR会话
  React.useEffect(() => {
    // 只在有活跃操作时才清理
    if (isLoading || qrCodeUrl || showVerificationStep) {
      console.log("🔄 平台切换到:", selectedPlatform, "- 清理活跃会话")
      
      // 立即清理大数据，避免渲染错误
      if (qrCodeUrl) {
        setQrCodeUrl(null)
      }
      
      // 取消异步操作
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      
      // 延迟清理其他状态
      setTimeout(() => {
        setIsLoading(false)
        setStatus("INIT")
        setLoginKey(null)
        setTxId(null)
        setShowVerificationStep(false)
        setPhoneNumber("")
        setVerificationCode("")
      }, 10)
    }
  }, [selectedPlatform])

  // 监听Telegram登录方式切换，立即清理相关状态（添加防抖）
  React.useEffect(() => {
    // 只在有活跃操作时才清理
    if (isLoading || qrCodeUrl || showVerificationStep) {
      console.log("🔄 Telegram登录方式切换到:", telegramLoginMethod, "- 清理活跃会话")
      
      // 使用setTimeout来延迟清理，避免状态更新冲突
      const timeoutId = setTimeout(() => {
        clearQRSession()
      }, 50)
      
      return () => clearTimeout(timeoutId)
    }
  }, [telegramLoginMethod])

  // 组件卸载时清理
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log("🧹 组件卸载，取消异步操作")
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const getPlatformIcon = (platform: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "w-8 h-8" : "w-10 h-10"  // 再次增大：sm改为8，md改为10
    if (platform === "whatsapp") {
      return (
        <img 
          src="/logos/WhatsApp.png" 
          alt="WhatsApp" 
          className={`${sizeClass} object-contain`}  // 去掉外圈，直接显示Logo
        />
      )
    }
    return (
      <img 
        src="/logos/Telegram.png" 
        alt="Telegram" 
        className={`${sizeClass} object-contain`}  // 去掉外圈，直接显示Logo
      />
    )
  }

  // 生成WhatsApp二维码
  const generateWhatsAppQR = async () => {
    console.log("🔵 生成WhatsApp二维码")
    
    // 创建新的AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    setIsLoading(true)
    setStatus("LOADING")
    setQrCodeUrl(null)
    
    try {
      // 阶段1：等待首次QR码生成
      console.log("🔄 等待open-wa启动并生成首次QR码...")
      let firstQrReceived = false
      const maxInitAttempts = 40 // 最多等待40次（约40秒）
      // 🆕 新流程：首先创建hash Session ID
      console.log("🆕 Step 1: 创建新的hash Session ID")
      const { sessionId: hashSessionId } = await WaApi.createSession()
      console.log("🎲 生成的hash Session ID:", hashSessionId)
      
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
            // ✅ 首次获取到QR码
            firstQrReceived = true
            console.log("✅ 首次获取WhatsApp QR码成功，长度:", response.dataUrl.length)
            setStatus("PENDING_SCAN")
            setQrCodeUrl(response.dataUrl)
            break
          } else {
            console.log("⏳ QR码尚未生成，1秒后重试...")
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(resolve, 1000)
              controller.signal.addEventListener('abort', () => {
                clearTimeout(timeout)
                reject(new Error('操作被取消'))
              })
            })
            attempts++
          }
        } catch (apiError: any) {
          console.log(`⚠️ API调用失败:`, apiError.message)
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 1000)
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('操作被取消'))
            })
          })
          attempts++
        }
      }
      
      if (!firstQrReceived && !controller.signal.aborted) {
        throw new Error('QR码生成超时，请重试')
      }
      
      // 阶段2：持续同步server的QR码变化
      console.log("🔄 QR码已加载，开始同步server端更新...")
      let lastQrData = ""
      
      while (!controller.signal.aborted) {
        try {
          const response = await WaApi.getQr(hashSessionId)
          
          if (controller.signal.aborted) break
          
          console.log("🔍 检查QR响应:", { hasDataUrl: !!response.dataUrl, length: response.dataUrl?.length || 0 })
          
          if (response.dataUrl && response.dataUrl.trim().length > 0) {
            // 检测QR码是否有变化
            if (response.dataUrl !== lastQrData) {
              lastQrData = response.dataUrl
              console.log("🔄 检测到QR码更新，同步到前端，长度:", response.dataUrl.length)
              setQrCodeUrl(response.dataUrl)
            }
            
            // 每3秒检查一次server端QR码变化
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(resolve, 3000)
              controller.signal.addEventListener('abort', () => {
                clearTimeout(timeout)
                reject(new Error('操作被取消'))
              })
            })
            
          } else {
            // 🔥 QR码为空，立即检查连接状态
            console.log("🛑 QR码为空，立即检查连接状态...")
            try {
              const statusResponse = await WaApi.getStatus(hashSessionId)
              console.log("📊 检查到会话状态:", statusResponse.status)
              
              if (statusResponse.status === "READY") {
                console.log("🎉 Step 12: 确认连接成功！停止轮询并更新UI")
                setConnectionStatus("已连接")
                setCurrentSessionId(hashSessionId) // 🔑 关键：保存会话ID
                setQrCodeUrl(null) // 清除QR码显示
                try {
                  // ✅ 自动保存账号
                  const saveResponse = await AccountManagementApi.saveWhatsAppAccount({
                    sessionId: hashSessionId,
                    displayName: accountName.trim() || `WhatsApp ${hashSessionId}`,
                    description: accountDescription.trim(),
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
                      description: saveResponse.message ||t("toast.missing_prompt"),
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

                  console.log('🔄 触发全局账号刷新事件:', { platform: selectedPlatform, currentSessionId })
                  window.dispatchEvent(new CustomEvent('accountAdded', { 
                    detail: { 
                      platform: selectedPlatform, 
                      sessionId: currentSessionId 
                    } 
                  }))
                  
                  // 🔄 额外触发通用刷新事件（兼容其他可能的监听器）
                  window.dispatchEvent(new CustomEvent('refreshAccounts'))
                  
                  // 🔄 延迟刷新，确保后端数据已保存
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('accountDataChanged'))
                  }, 500)
      
              
                  // ✅ 自动关闭弹窗并刷新列表
                  setTimeout(() => {
                    handleOpenChange(false);
                    setConnectionStatus("")
                    setQrCodeUrl(null)
                    setStatus("INIT")
                    setCurrentSessionId(null)
                    
                    // 重置手机号登录相关状态
                    setPhoneNumber("")
                    setVerificationCode("")
                    setTwoFAPassword("")
                    setShowVerificationStep(false)
                    setShowTwoFAStep(false)
                    setShowPassword(false)
                    setTxId(null)
                    setWorkspaceId(null)
                    setBrandId(null)
                    
                    // 重置账号信息
                    setAccountName("")
                    setAccountDescription("")
                  }, 1000);
                } catch (err: any) {
                  console.error("❌ 自动保存失败:", err);
                  toast({
                    title: t("toast.save_failed"),
                    description: err.message,
                    variant: "destructive",
                    duration: 3000,
                  });
                }
              
                break // 跳出轮询循环
              } else if (statusResponse.status === "QR_SCANNED") {
                console.log("📱 Step 9: QR已扫描，显示连接中状态")
                setConnectionStatus("连接中")
              } else if (statusResponse.status === "CONNECTING") {
                console.log("🔗 Step 10: 正在连接中...")
                setConnectionStatus("连接中")
              } else {
                console.log(`⏳ 当前状态: ${statusResponse.status}，继续轮询...`)
              }
            } catch (statusError) {
              console.log("⚠️ 状态检查失败:", statusError)
            }
            
            // 等待1秒后继续检查
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } catch (apiError: any) {
          console.log(`⚠️ QR同步失败:`, apiError.message)
          // 网络错误等待2秒后重试
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 2000)
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('操作被取消'))
            })
          })
        }
      }
      
    } catch (error: any) {
      if (!controller.signal.aborted) {
        console.error("❌ WhatsApp QR生成失败:", error)
        setStatus("ERROR")
        if (!error.message.includes('取消')) {
          toast({
            title: t("toast.generate_failed"),
            description: `${t("toast.qr_generate_failed")}: ${error.message}`,
            variant: "destructive",
            duration: 3000,
          })
        }
      } else {
        console.log("🚫 WhatsApp QR操作被正常取消")
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
      // 清理controller引用
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  // 生成Telegram二维码
  const generateTelegramQR = async () => {
    console.log("🔵 生成Telegram二维码")
    
    // 创建新的AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    setIsLoading(true)
    setStatus("LOADING")
    setQrCodeUrl(null)
    
    try {
      // 模拟真实的QR生成延迟（3秒）
      console.log("⏳ 模拟Telegram QR生成中...")
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 3000)
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          reject(new Error('操作被取消'))
        })
      })
      
      // 检查是否被取消
      if (controller.signal.aborted) {
        console.log("🚫 Telegram QR操作已被取消")
        return
      }
      
      const response = await TgApi.startQr()
      console.log("✅ Telegram QR生成成功:", response)
      
      // 再次检查是否被取消
      if (controller.signal.aborted) {
        console.log("🚫 Telegram QR操作已被取消（API调用后）")
        return
      }
      
      setLoginKey(response.loginKey)
      setStatus("PENDING_SCAN")
      
      // 按照用户建议：直接使用qrPayload让前端重新生成更清晰的QR码
      // 忽略后端的qrImage（密度太高），用qrPayload获取最正统的QR
      console.log("🎯 使用qrPayload重新生成清晰QR码:", response.qrPayload)
      setQrCodeUrl(response.qrPayload)
      setTgQrImage(null)  // 不使用后端的密集qrImage
      
      // 开始轮询检查Telegram登录状态
      console.log("🔄 开始轮询Telegram登录状态...")
      let pollCount = 0
      const maxPollAttempts = 60  // 最多轮询60次（2分钟）
      
      while (!controller.signal.aborted && pollCount < maxPollAttempts) {
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 2000)  // 每2秒检查一次
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('操作被取消'))
            })
          })
          
          if (controller.signal.aborted) {
            console.log("🚫 Telegram轮询被取消")
            break
          }
          
          pollCount++
          console.log(`🔍 Telegram轮询第${pollCount}次，loginKey: ${response.loginKey}`)
          
          const pollResult = await TgApi.poll(response.loginKey)
          console.log("📊 Telegram轮询结果:", pollResult)
          
          if (pollResult.ok) {
            console.log("✅ Telegram登录成功！停止轮询")
            setStatus("READY")
            setConnectionStatus("已连接")
            setCurrentSessionId(`tg-${response.loginKey}`) // 🔑 关键：保存Telegram会话ID（格式：tg-前缀）
            // 立即停止轮询，不再发送任何请求
            return
          }
          
          // 检查是否是token已清理的情况
          if (pollResult && 'error' in pollResult && pollResult.error === "TOKEN_NOT_FOUND") {
            console.log("🛑 Telegram登录已完成或token已清理，停止轮询")
            setStatus("READY")  // 假设是登录成功后清理的
            setConnectionStatus("已连接")
            setCurrentSessionId(`tg-${response.loginKey}`) // 🔑 关键：保存Telegram会话ID（格式：tg-前缀）
            return
          }
          
        } catch (pollError: any) {
          pollCount++
          console.log(`⚠️ Telegram轮询失败 (第${pollCount}次):`, pollError.message)
          
          // 如果是token过期错误，提前停止轮询
          if (pollError.message.includes('AUTH_TOKEN_EXPIRED') || 
              pollError.message.includes('AUTH_TOKEN_INVALID') ||
              pollError.message.includes('ERR_CONNECTION_REFUSED')) {
            console.log("🛑 检测到token过期或连接错误，停止轮询")
            setStatus("ERROR")
            return
          }
          
          // 其他错误等待后继续
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 3000)  // 失败后等待3秒
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('操作被取消'))
            })
          })
        }
      }
      
      // 如果轮询次数达到上限
      if (pollCount >= maxPollAttempts && !controller.signal.aborted) {
        console.log("⏰ Telegram轮询超时，停止轮询")
        setStatus("ERROR")
      }
    } catch (error: any) {
      if (!controller.signal.aborted) {
        console.error("❌ Telegram QR生成失败:", error)
        setStatus("ERROR")
        if (!error.message.includes('取消')) {
          toast({
            title: "生成失败",
            description: `生成二维码失败: ${error}`,
            variant: "destructive",
            duration: 3000,
          })
        }
      } else {
        console.log("🚫 Telegram QR操作被正常取消")
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
      // 清理controller引用
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

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
        
        // 🔍 提取详细的错误信息
        let errorMessage = error?.message || error?.response?.data?.message || String(error);
        console.log("🔍 发送验证码错误详情:", errorMessage);
        
        let title = "发送验证码失败";
        let description = errorMessage;
        
        if (errorMessage.includes('Failed to fetch')) {
          title = "网络连接失败";
          description = "无法连接到服务器，请检查网络连接";
        } else if (errorMessage.includes('PHONE_NUMBER_INVALID')) {
          title = "手机号格式错误";
          description = "请输入正确的手机号格式（包含国家代码）";
        } else {
          description = `失败原因: ${errorMessage}`;
        }
        
        toast({
          title,
          description,
          variant: "destructive",
          duration: 5000,
        })
      } else {
        console.log("🚫 Telegram手机号操作被正常取消")
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
      // 清理controller引用
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

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
      // ✅ Send all required info directly through verifyPhone
      const result = await TgApi.verifyPhone(
        txId,
        verificationCode,
        twoFAPassword || undefined,
        workspaceId ?? undefined,
        brandId ?? undefined,
        accountDescription || "",
        accountName || ""
      );
  
      console.log("✅ Telegram验证结果:", result);

      if (!result?.ok) {
        throw new Error(result?.message || "保存账号失败");
      }
      console.log("response", result.warning)
      console.log("response", result.message)

      const telegramSessionId = `tg-${txId}`;

  
      // ⚠️ If backend warns about missing workspaceId or brandId
      if (result.warning) {
        toast({
          title: t("toast.missing_field"),
          description: result.message,
          variant: "destructive",
          duration: 99999999999,
        });
      }else {
      
        // ✅ Always close dialog (even when warning)
        setConnectionStatus("已连接");
        setStatus("READY");
      
        toast({
          title: t("toast.account_added"),
          description: t("toast.telegram_added"),
          duration: 3000,
          variant: "success",
        });
      }
      
      // 🔄 Trigger global refresh events
      console.log('🔄 触发全局账号刷新事件:', { platform: selectedPlatform, telegramSessionId });
      window.dispatchEvent(new CustomEvent('accountAdded', {
        detail: { platform: "telegram", sessionId: telegramSessionId },
      }));
      window.dispatchEvent(new CustomEvent('refreshAccounts'));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('accountDataChanged'));
      }, 500);
      
      // ✅ Reset states & close dialog
      setConnectionStatus("");
      setQrCodeUrl(null);
      setStatus("INIT");
      setCurrentSessionId(null);
      
      setPhoneNumber("");
      setVerificationCode("");
      setTwoFAPassword("");
      setShowVerificationStep(false);
      setShowTwoFAStep(false);
      setShowPassword(false);
      setTxId(null);
      setWorkspaceId(null);
      setBrandId(null);
      
      setAccountName("");
      setAccountDescription("")
      handleOpenChange(false); 
      console.log("✅ Telgram账号已保存到数据库:")
      // 🧩 Only call handleSave if backend doesn't already save it
      //await handleSaveAccountWithId(telegramSessionId);

    } catch (error: any) {
      console.error("❌ 验证码验证失败:", error);
  
      let errorMessage =
        error?.message || error?.response?.data?.message || String(error);
  
      console.log("🔍 Telegram验证码错误详情:", errorMessage);
  
      if (errorMessage.includes("TG_2FA_REQUIRED")) {
        setShowTwoFAStep(true);
        toast({
          title: t("toast.two_fa_required"),
          description: t("toast.two_fa_prompt"),
          duration: 3000,
        });
      } else if (errorMessage.includes("TG_SIGNUP_REQUIRED")) {
        toast({
          title: t("toast.signup_required"),
          description: t("toast.signup_prompt"),
          variant: "destructive",
          duration: 5000,
        });
      } else if (errorMessage.includes("TG_CODE_INVALID")) {
        toast({
          title: "验证码错误",
          description: "验证码无效，请检查并重新输入",
          variant: "destructive",
          duration: 3000,
        });
      } else if (errorMessage.includes("TX_NOT_FOUND")) {
        toast({
          title: "会话已过期或无效",
          description: "请重新获取验证码后再试一次",
          variant: "destructive",
          duration: 5000,
        });
      } else {
        toast({
          title: "Telegram验证失败",
          description: `失败原因: ${errorMessage}`,
          variant: "destructive",
          duration: 5000,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };
  

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
      const telegramSessionId = `tg-${txId}`;
      setConnectionStatus("已连接")
      setCurrentSessionId(telegramSessionId) // 🔑 关键：保存Telegram会话ID（格式：tg-前缀）
      toast({
        title: t("toast.connection_success"),
        description: t("toast.telegram_connected"),
        duration: 3000,
      })
      // 🔧 直接传递sessionId，避免状态更新延迟问题
      //await handleSaveAccountWithId(telegramSessionId)
    } catch (error: any) {
      console.error("❌ 2FA验证失败:", error)
      
      // 🔍 提取详细的错误信息
      let errorMessage = error?.message || error?.response?.data?.message || String(error);
      console.log("🔍 Telegram 2FA错误详情:", errorMessage);
      
      let title = "2FA验证失败";
      let description = errorMessage;
      
      if (errorMessage.includes('TG_PASSWORD_INVALID')) {
        title = "密码错误";
        description = "2FA密码不正确，请重新输入";
      } else if (errorMessage.includes('Failed to fetch')) {
        title = "网络连接失败";
        description = "无法连接到服务器，请检查网络连接";
      } else {
        description = `失败原因: ${errorMessage}`;
      }
      
      toast({
        title,
        description,
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 🔧 新的保存函数，接受明确的sessionId参数
  const handleSaveAccountWithId = async () => {
    if (!currentSessionId || status !== "CONNECTED") return;
    
    try {
      setIsLoading(true)
      
      console.log("🔧 使用明确的sessionId保存账号:", currentSessionId);

      const accountData = {
        sessionId: currentSessionId,
        displayName: accountName.trim() || `${selectedPlatform === "whatsapp" ? "WhatsApp" : "Telegram"} ${currentSessionId}`,
        description: accountDescription.trim(),
        workspaceId: Number(workspaceId),
        brandId: Number(brandId),
      };
      
      console.log("✅ 准备保存账号", { 
        platform: selectedPlatform, 
        ...accountData,
        connectionStatus,
        txId,
        loginKey 
      })
      
    // 🔑 调用对应平台的保存 API
    let response: any;

    if (selectedPlatform === "whatsapp") {
      response = await AccountManagementApi.saveWhatsAppAccount(accountData);
    } else if (selectedPlatform === "telegram") {
      response = await AccountManagementApi.saveTelegramAccount(accountData);
    }

    console.log("📩 API 返回:", response);

    // ❌ 若 API 返回 ok === false，则抛出错误
    if (!response?.ok) {
      throw new Error(response?.message || "保存账号失败");
    }

    // ⚠️ 若后端返回 warning
    if (response.warning) {
      toast({
        title: t("toast.missing_field"),
        description: response.message,
        variant: "destructive", // 红色提示
        duration: 99999999999, // 长时间显示
      });
    } else {
      // ✅ 成功提示
      toast({
        title: t("toast.account_added"),
        description:
          selectedPlatform === "whatsapp"
            ? t("toast.whatsapp_added")
            : t("toast.telegram_added"),
        variant: "success",
        duration: 3000,
      });
    }

    console.log(`✅ ${selectedPlatform}账号已保存到数据库:`, currentSessionId);

      
      // 🔄 触发全局账号数据刷新事件
      console.log('🔄 触发全局账号刷新事件:', { platform: selectedPlatform, currentSessionId })
      window.dispatchEvent(new CustomEvent('accountAdded', { 
        detail: { 
          platform: selectedPlatform, 
          sessionId: currentSessionId 
        } 
      }))
      
      // 🔄 额外触发通用刷新事件（兼容其他可能的监听器）
      window.dispatchEvent(new CustomEvent('refreshAccounts'))
      
      // 🔄 延迟刷新，确保后端数据已保存
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('accountDataChanged'))
      }, 500)
      
      // 重置状态
      setConnectionStatus("")
      setQrCodeUrl(null)
      setStatus("INIT")
      setCurrentSessionId(null)
      
      // 重置手机号登录相关状态
      setPhoneNumber("")
      setVerificationCode("")
      setTwoFAPassword("")
      setShowVerificationStep(false)
      setShowTwoFAStep(false)
      setShowPassword(false)
      setTxId(null)
      setWorkspaceId(null)
      setBrandId(null)
      
      // 重置账号信息
      setAccountName("")
      setAccountDescription("")
      
      handleOpenChange(false)
    } catch (error: any) {
      console.error("❌ 保存账号失败:", error)
      
      // 🔍 提取详细的错误信息
      let errorMessage = "未知错误";
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      console.log("🔍 详细错误信息:", errorMessage);
      
      toast({
        title: `${selectedPlatform === "whatsapp" ? "WhatsApp" : "Telegram"}账号保存失败`,
        description: `失败原因: ${errorMessage}`,
        variant: "destructive",
        duration: 5000, // 延长显示时间让用户能看清楚
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveAccount = async () => {
    if (!currentSessionId) {
      toast({
        title: "保存失败",
        description: "会话ID不存在，请重新连接",
        variant: "destructive",
        duration: 3000,
      })
      return;
    }
    
    //await handleSaveAccountWithId(currentSessionId);
  }

  const defaultTrigger = (
    <Button size="sm" className="flex items-center gap-2">
      <Plus className="h-3 w-3" />
      添加账号
    </Button>
  )

  return (
    <Dialog open={currentOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {!trigger && <DialogTrigger asChild>{defaultTrigger}</DialogTrigger>}
      <DialogContent className="w-[95vw] h-[95vh] max-w-none max-h-none p-4">
      <DialogHeader>
          <DialogTitle>{t("dialog.add_account")}</DialogTitle>
        </DialogHeader>
        
        {/* 状态指示器 */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1 px-1 py-1 rounded-full text-xs font-medium bg-gray-50">
            {connectionStatus === "已连接" && (
              <>
                <CheckCircle className="h-1 w-1 text-green-600" />
                <span className="text-green-600">{t("dialog.connection_success")}</span>
              </>
            )}
            {connectionStatus === "连接中" && (
              <>
                <Loader2 className="h-1 w-1 animate-spin text-blue-600" />
                <span className="text-blue-600">{t("dialog.connecting")}</span>
              </>
            )}
            {status === "LOADING" && !connectionStatus && (
              <>
                <Loader2 className="h-1 w-1 animate-spin text-gray-600" />
                <span className="text-gray-600">{t("dialog.loading")}</span>
              </>
            )}
            {status === "PENDING_SCAN" && !connectionStatus && (
              <>
                <QrCode className="h-1 w-1 text-blue-600" />
                <span className="text-blue-600">{t("dialog.waiting_scan")}</span>
              </>
            )}
            {status === "CODE_SENT" && (
              <>
                <MessageSquare className="h-1 w-1 text-blue-600" />
                <span className="text-blue-600">{t("dialog.code_sent_to")}</span>
              </>
            )}
            {status === "ERROR" && (
              <>
                <XCircle className="h-1 w-1 text-red-600" />
                <span className="text-red-600">{t("dialog.connection_failed")}</span>
              </>
            )}
            {status === "INIT" && !connectionStatus && (
              <span className="text-gray-500">{t("dialog.please_select_connection")}</span>
            )}
          </div>
        </div>
        
        <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2"> {/* Changed gap-2 to gap-4 for better spacing */}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              {/* Added icon for consistency */}
              <MessageSquare className="h-4 w-4 text-green-600" />
              {t("dialog.platform_type")}
              <span className="text-red-500">*</span>
            </Label>
            <Select
              value={selectedPlatform}
              onValueChange={(value: "whatsapp" | "telegram") => {
                setSelectedPlatform(value)
                setTelegramLoginMethod("phone") // Telegram 默认使用手机号验证
                setShowVerificationStep(false)
              }}
            >
              <SelectTrigger className="w-full h-10 border-gray-300 hover:border-blue-400 focus:border-blue-500 
                transition-colors bg-white dark:bg-gray-800 
                rounded-lg shadow-sm dark:border-gray-600">
                <SelectValue>
                  {selectedPlatform === "whatsapp" ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
                        <img src="/logos/WhatsApp.png" alt="WhatsApp" className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        WhatsApp
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                        <img src="/logos/Telegram.png" alt="Telegram" className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        Telegram
                      </span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 
                shadow-lg rounded-lg max-h-60 overflow-y-auto">
                <SelectItem value="whatsapp" className="flex items-center gap-3 py-3 px-4 hover:bg-blue-50 dark:hover:bg-blue-900/40 
                  cursor-pointer transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                    <img src="/logos/WhatsApp.png" alt="WhatsApp" className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">WhatsApp</span>
                </SelectItem>
                <SelectItem value="telegram" className="flex items-center gap-3 py-3 px-4 hover:bg-blue-50 dark:hover:bg-blue-900/40 
                  cursor-pointer transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center">
                    <img src="/logos/Telegram.png" alt="Telegram" className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Telegram</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
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
                    No workspaces
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
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
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
                    No brands 
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
            <Label htmlFor="display-name">{t("dialog.display_name")}</Label>
            <Input 
              id="display-name" 
              placeholder={t("dialog.display_name") + "..."} 
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("dialog.description")}</Label>
            <Textarea 
              id="description" 
              placeholder={t("dialog.description") + "..."} 
              value={accountDescription}
              onChange={(e) => setAccountDescription(e.target.value)}
            />
          </div>

          <Separator />

          <div className="space-y-1">
            <Label>{t("dialog.connection_settings")}</Label>

            {selectedPlatform === "whatsapp" ? (
              // WhatsApp 连接设置 - 只有二维码登录
              <Card>
                <CardContent className="p-1">
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="w-38 h-38 border-2 border-dashed border-muted-foreground rounded-lg flex items-center justify-center">
                        {connectionStatus === "已连接" ? (
                          // 🎉 连接成功显示
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                              <CheckCircle className="h-8 w-8 text-green-600" />
                            </div>
                            <span className="text-sm text-green-600 font-medium">连接成功</span>
                          </div>
                        ) : status === "LOADING" ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span className="text-xs text-gray-500">生成中...</span>
                          </div>
                        ) : qrCodeUrl && selectedPlatform === "whatsapp" ? (
                          <img src={qrCodeUrl} alt="WhatsApp QR" className="w-40 h-40 object-contain" />
                        ) : (
                          <QrCode className="h-14 w-14 text-muted-foreground" />
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
                          <p className="text-xs text-muted-foreground mt-1">{t("dialog.scan_with_app")}</p>
                        </>
                      )}
                    </div>                  
                    
                    {status === "INIT" ? (
                      <Button 
                        variant="outline" 
                        className="w-full bg-transparent" 
                        onClick={generateWhatsAppQR}
                        disabled={isLoading}
                      >
                        <Smartphone className="h-3 w-3 mr-2" />
                        {t("dialog.generate_qr")}
                      </Button>
                    ) : status === "PENDING_SCAN" ? (
                      <div className="space-y-2">
                        <div className="text-xs text-green-600 text-center">
                          📱 {t("dialog.scan_with_app")}
                        </div>
                        <Button 
                          variant="outline" 
                          className="w-full bg-transparent" 
                          onClick={clearQRSession}
                        >
                          重新生成
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="w-full bg-transparent" 
                        onClick={clearQRSession}
                      >
                        重试
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              // Telegram 连接设置 - 只支持手机号验证
              <div className="space-y-1">
                {/* QR码选项已注释掉，只保留手机号验证 */}
                {/* {telegramLoginMethod === "qr" ? (
                  <Card>
                    <CardContent className="p-1">
                      <div className="text-center space-y-1">
                        <div className="flex justify-center">
                          <div className="w-35 h-35 border-2 border-dashed border-muted-foreground rounded-lg flex items-center justify-center">
                            {status === "LOADING" ? (
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                <span className="text-xs text-gray-500">{t("dialog.loading")}...</span>
                              </div>
                            ) : selectedPlatform === "telegram" && telegramLoginMethod === "qr" && (tgQrImage || qrCodeUrl) ? (
                              <div className="p-1">
                                <QRErrorBoundary>
                                  {tgQrImage ? (
                                    <img src={tgQrImage} alt="Telegram QR" className="w-38 h-38 object-contain" />
                                  ) : qrCodeUrl ? (
                                    <BigQR value={qrCodeUrl} size={125} />
                                  ) : null}
                                </QRErrorBoundary>
                              </div>
                            ) : (
                              <QrCode className="h-12 w-12 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{t("dialog.scan_qr")}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t("dialog.scan_with_telegram")}</p>
                        </div>
                        {status === "INIT" ? (
                          <Button 
                            variant="outline" 
                            className="w-full bg-transparent"
                            onClick={generateTelegramQR}
                            disabled={isLoading}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
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
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {telegramLoginMethod === "qr" ? t("dialog.use_phone") : t("dialog.use_qr")}
                  </Button>
                </div> */}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("dialog.cancel")}
            </Button>
            {/* 🆕 按钮始终显示，但根据状态禁用/启用 */}
            {selectedPlatform === "whatsapp" ? (
              <Button 
                onClick={handleSaveAccountWithId}
                disabled={connectionStatus !== "已连接"}
                className={connectionStatus === "已连接" ? "" : "opacity-50 cursor-not-allowed"}
              >
                {t("dialog.add")}
              </Button>
            ) : selectedPlatform === "telegram" && (telegramLoginMethod === "qr" || showVerificationStep) ? (
              <Button 
                onClick={handleSaveAccount}
                disabled={false}
              >
                {telegramLoginMethod === "phone" && !showVerificationStep ? t("common.next") : t("dialog.add")}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
