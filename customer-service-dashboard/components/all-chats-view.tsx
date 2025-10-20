"use client"

import * as React from "react"
import { Search, MoreVertical, Phone, Video, CheckCircle2, ChevronDown, MessageSquare, CheckCircle, FileText, Smile, Mic, MapPin, User } from "lucide-react"
import lottie from 'lottie-web'
import * as pako from 'pako'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Checkbox } from "@/components/ui/checkbox"
import { useLanguage } from "@/contexts/language-context"
import { ChatApi, ChatInfo, ChatMessage } from "@/lib/chat-api"
import { AccountManagementApi, AccountInfo } from "@/lib/account-management-api"
import { mockAccounts, mockChats, mockMessages } from "@/lib/mock-data"
import { websocketClient, WebSocketMessage } from "@/lib/websocket-client"
import { eventManager, ACCOUNT_EVENTS, CHAT_EVENTS } from "@/lib/event-manager"
import { PlatformIcon, StatusIndicator } from "@/components/shared"
import WebSocketIndicator from "./websocket-indicator"
import { maskChatName } from "@/lib/utils"
import { fetchWithAuth } from "@/lib/fetchWithAuth"

// 顶层媒体URL解析：补全域名并修正 undefined/api/... 情况
const __API_BASE_MEDIA__ = process.env.NEXT_PUBLIC_API_BASE as string 
const resolveMediaUrl = (url?: string): string => {
  if (!url) return ''
  // 清理多余的引号和编码引号
  let trimmed = url.trim()
  try {
    // 解码一次，处理 %22 等编码引号
    trimmed = decodeURIComponent(trimmed)
  } catch {}
  // 去掉首尾引号
  trimmed = trimmed.replace(/^['"]+|['"]+$/g, '')
  // 去掉残留的编码引号
  trimmed = trimmed.replace(/%22/gi, '')

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.startsWith('/')) return `${__API_BASE_MEDIA__}${trimmed}`
  if (trimmed.startsWith('undefined/api/')) return `${__API_BASE_MEDIA__}${trimmed.replace('undefined', '')}`
  return trimmed
}

// 语音消息组件
interface VoiceMessageComponentProps {
  message: any;
  content: string;
  messageId: string;
  isOwn: boolean;
}

const VoiceMessageComponent: React.FC<VoiceMessageComponentProps> = ({ message, content, messageId, isOwn }) => {
  const { t } = useLanguage()
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);
  const [downloadCompleted, setDownloadCompleted] = React.useState(false);
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null);
    
    // 平台识别：从 message.chatId 前缀推断（tg:/wa:）
    const platform = React.useMemo(() => {
      const cid = (message as any)?.chatId as string | undefined;
      if (typeof cid === 'string') {
        if (cid.startsWith('tg:')) return 'tg';
        if (cid.startsWith('wa:')) return 'wa';
      }
      return undefined;
    }, [message]);
    
    // 检查 content 是否是有效的媒体 URL
    const isMediaUrl = React.useMemo(() => {
      if (!content) return false;
      // 检查是否包含媒体 URL 标识符
      return content.includes('/api/media/') || content.startsWith('http') || content.startsWith('/');
    }, [content]);
    
    // 生成主/备媒体URL：兼容旧目录名（tg/<id>）与新目录名（tg/tg-<id>）
    const primaryUrl = React.useMemo(() => {
      if (!isMediaUrl) {
        console.log(`🎤 [语音URL] content不是媒体URL，跳过解析: "${content}"`);
        return '';
      }
      const resolved = resolveMediaUrl(content);
      console.log(`🎤 [语音URL] 原始content: "${content}", 解析后: "${resolved}"`);
      return resolved;
    }, [content, isMediaUrl]);
    const fallbackUrl = React.useMemo(() => {
      // 仅对 Telegram 生效；WhatsApp 保持后端返回路径
      if (platform !== 'tg') return '';
      const url = resolveMediaUrl(content);
      try {
        const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        // 仅处理 /api/media/tg/<accountId>/voice/<file>
        if (u.pathname.startsWith('/api/media/tg/')) {
          const parts = u.pathname.split('/'); // ['', 'api', 'media', 'tg', '<accountId>', 'voice', '<file>']
          if (parts.length >= 6) {
            const acc = parts[4];
            if (acc && !acc.startsWith('tg-')) {
              parts[4] = `tg-${acc}`;
              const rebuilt = parts.join('/');
              return `${u.origin}${rebuilt}${u.search}`;
            }
          }
        }
      } catch {}
      return '';
    }, [content]);

  // 初始化音频源
  React.useEffect(() => {
    if (content) {
      console.log('🎤 初始化语音消息:', { content, primaryUrl, isMediaUrl });
      if (isMediaUrl && primaryUrl) {
        setIsLoading(true);
        setHasError(false);
        setDownloadCompleted(false);
        setAudioSrc(primaryUrl);
      } else {
        // 如果不是媒体 URL，直接显示为文本消息
        setIsLoading(false);
        setHasError(false);
        setDownloadCompleted(true);
        setAudioSrc(null);
      }
    }
  }, [content, primaryUrl, isMediaUrl]);

  // 监听媒体下载完成通知
  React.useEffect(() => {
    const handleMediaDownloaded = (data: any) => {
      console.log('🎤 收到语音媒体下载通知:', data);
      
      // 提取音频URL的路径部分（去掉域名和查询参数）
      const audioSrcPath = audioSrc?.split('?')[0]?.split('/api/media')[1] || '';
      const primaryUrlPath = primaryUrl?.split('?')[0]?.split('/api/media')[1] || '';
      
      // 更宽松的匹配：检查文件路径是否包含音频路径，或者检查messageId是否匹配
      const isPathMatch = data?.filePath && (audioSrcPath || primaryUrlPath) && 
        (data.filePath.includes(audioSrcPath) || data.filePath.includes(primaryUrlPath));
      const isMessageIdMatch = data?.messageId && (audioSrc?.includes(data.messageId) || primaryUrl?.includes(data.messageId));
      const isVoiceType = data?.mediaType === 'voice' || data?.mediaType === 'ptt';
      
      console.log('🔍 检查语音匹配条件:', {
        dataFilePath: data?.filePath,
        currentAudioSrc: audioSrc,
        primaryUrl: primaryUrl,
        audioSrcPath: audioSrcPath,
        primaryUrlPath: primaryUrlPath,
        dataMessageId: data?.messageId,
        dataMediaType: data?.mediaType,
        isPathMatch: isPathMatch,
        isMessageIdMatch: isMessageIdMatch,
        isVoiceType: isVoiceType,
        finalMatch: isPathMatch || isMessageIdMatch || isVoiceType
      });

      if (data && data.filePath && (isPathMatch || isMessageIdMatch || isVoiceType)) {
        console.log('🎤 语音下载完成通知匹配成功:', data);
        setDownloadCompleted(true);
        // 添加时间戳防止缓存
        setAudioSrc(`${data.filePath}?t=${Date.now()}`);
        console.log('✅ 语音下载状态已更新');
      } else {
        console.log('❌ 语音下载通知不匹配或缺少必要信息');
      }
    };

    // 检查WebSocket连接状态
    const checkWebSocketStatus = () => {
      const status = websocketClient.getConnectionStatus?.();
      console.log('🔍 [语音组件] WebSocket状态检查:', status);
      if (!status?.isConnected) {
        console.warn('⚠️ [语音组件] WebSocket未连接，可能无法接收媒体下载通知');
      }
    };

    // 立即检查一次
    checkWebSocketStatus();

    // 监听全局媒体下载事件
    window.addEventListener('chatx:mediaDownloaded', handleMediaDownloaded);

    return () => {
      window.removeEventListener('chatx:mediaDownloaded', handleMediaDownloaded);
    };
  }, [audioSrc, downloadCompleted]);

  // 添加超时机制，如果3秒内没有下载完成，显示错误
  // React.useEffect(() => {
  //   if (isLoading && !downloadCompleted) {
  //     const timeout = setTimeout(() => {
  //       console.log('⏰ 语音下载超时:', content);
        
  //       // 超时后，尝试直接检查文件是否可用
  //       const testAudio = new Audio();
  //       testAudio.oncanplay = () => {
  //         console.log('✅ [超时检查] 音频文件实际可用，更新状态');
  //         setDownloadCompleted(true);
  //         setIsLoading(false);
  //         setHasError(false);
  //       };
  //       testAudio.onerror = () => {
  //         console.log('❌ [超时检查] 音频文件确实不可用');
  //         setIsLoading(false);
  //         setHasError(true);
  //       };
  //       testAudio.src = audioSrc || primaryUrl;
        
  //       // 给测试音频一些时间
  //       setTimeout(() => {
  //         if (!downloadCompleted) {
  //           console.log('⏰ 超时检查后仍未完成，显示错误');
  //           setIsLoading(false);
  //           setHasError(true);
  //         }
  //       }, 1000); // 减少到1秒
  //     }, 3000); // 减少到3秒

  //     return () => clearTimeout(timeout);
  //   }
  // }, [isLoading, downloadCompleted, content, audioSrc, primaryUrl]);

  const handleCanPlay = () => {
    console.log('🎤 语音onCanPlay事件触发');
    console.log('📊 当前状态:', { downloadCompleted, isLoading, hasError });

    // 如果已经有错误状态，不处理
    if (hasError) {
      console.log('⚠️ 当前有错误状态，跳过处理');
      return;
    }

    // 如果音频可以播放，说明文件已经可用，应该立即隐藏loading
    console.log('✅ 语音文件可以播放，隐藏loading');
    setIsLoading(false);
    setHasError(false);
    
    // 如果还没有收到WebSocket下载完成通知，也标记为完成
    if (!downloadCompleted) {
      console.log('📡 音频可播放但未收到WebSocket通知，标记为下载完成');
      setDownloadCompleted(true);
    }
  };

  const handleError = (e: any) => {
    setIsLoading(false);
    setHasError(true);
    console.log('❌ 语音加载失败:', content);
    console.log('❌ 语音消息详情:', {
      content,
      messageType: message.messageType,
      messageId,
      isOwn,
      error: e,
      audioElement: e.currentTarget,
      networkState: e.currentTarget.networkState,
      readyState: e.currentTarget.readyState,
      errorCode: e.currentTarget.error?.code,
      errorMessage: e.currentTarget.error?.message
    });
  };

  // const handleRetry = () => {
  //   if (retryCount < 2) { // 最多重试2次
  //     setRetryCount(prev => prev + 1);
  //     setIsLoading(true);
  //     setHasError(false);
  //     setDownloadCompleted(false);
      
  //     console.log(`🔄 重试加载语音文件 (${retryCount + 1}/2):`, content);
      
  //     // 从 content URL 中提取参数
  //     const url = new URL(content, window.location.origin);
  //     const pathParts = url.pathname.split('/');
  //     const accountId = pathParts[3]; // /api/media/wa/{accountId}/voice/{messageId}
  //     const type = pathParts[4];
  //     const messageId = pathParts[5];
      
  //     // 调用重试下载API
  //     const retryApiUrl = `/api/media/wa/${accountId}/${type}/${messageId}/retry`;
  //     fetch(retryApiUrl, { 
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' }
  //     })
  //       .then(response => response.json())
  //       .then(data => {
  //         if (data.success) {
  //           console.log('✅ 重试下载请求已发送:', data);
            
  //           if (data.alreadyExists) {
  //             console.log('📁 文件已存在，直接使用现有文件');
  //             // 文件已存在，直接设置音频源
  //             const retryUrl = `${content}${content.includes('?') ? '&' : '?'}retry=${retryCount}&t=${Date.now()}`;
  //             setAudioSrc(retryUrl);
  //             // 文件已存在，不需要等待下载，直接标记为完成
  //             setDownloadCompleted(true);
  //             // 立即隐藏loading和错误状态
  //             setIsLoading(false);
  //             setHasError(false);
  //             console.log('✅ 文件已存在，状态已重置');
  //           } else {
  //             console.log('📥 文件不存在，等待重新下载...');
  //             // 文件不存在，重新设置音频源，添加时间戳防止缓存
  //             const retryUrl = `${content}${content.includes('?') ? '&' : '?'}retry=${retryCount}&t=${Date.now()}`;
  //             setAudioSrc(retryUrl);
              
  //             // 延长超时时间，给后端更多时间下载
  //             setTimeout(() => {
  //               if (!downloadCompleted) {
  //                 console.log('⏰ 重试超时，显示错误');
  //                 setIsLoading(false);
  //                 setHasError(true);
  //               }
  //             }, 15000); // 15秒超时
  //           }
  //         } else {
  //           console.log('❌ 重试下载请求失败:', data);
  //           setIsLoading(false);
  //           setHasError(true);
  //         }
  //       })
  //       .catch(error => {
  //         console.log('❌ 重试下载请求错误:', error);
  //         setIsLoading(false);
  //         setHasError(true);
  //       });
  //   }
  // };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
      <Mic className="h-4 w-4" />
      
      {/* 如果没有音频源，显示文本内容 */}
      {!audioSrc && !primaryUrl ? (
        <span className="text-sm">{content}</span>
      ) : (
        <>
          {/* <span className="text-sm">[{t('voice.voice_message')}]</span> */}
          
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="animate-spin w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full"></div>
              <span>{downloadCompleted ? t('common.preparing_playback') : t('common.downloading')}</span>
            </div>
          )}
          
          {hasError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <span>❌ {t('common.loading_failed')}</span>
              {/* {retryCount < 2 && (
                <button 
                  onClick={handleRetry}
                  className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                >
                  重试
                </button>
              )} */}
            </div>
          )}
          
          {/* 音频控件 - 始终挂载，用样式控制可见性 */}
          <audio
            key={`${audioSrc || content}`}
            className="h-6"
            controls
            src={audioSrc || primaryUrl}
            onLoadStart={() => setIsLoading(true)}
            onCanPlay={handleCanPlay}
            onError={handleError}
            preload="metadata"
            style={{ display: hasError ? 'none' : (isLoading ? 'none' : 'block') }}
          >
            <source
              src={audioSrc || primaryUrl}
              type="audio/ogg"
            />
            {fallbackUrl && fallbackUrl !== primaryUrl && (
              <source
                src={fallbackUrl}
                type="audio/ogg"
              />
            )}
          </audio>
        </>
      )}
    </div>
  );
};

/**
 * 📱 完整消息处理流程图
 * =====================================================
 *
 * WebSocket 消息 → 去重检查 → 消息数组 append
 *        ↓                    ↓
 * handleNewMessage()    setMessages() - 全局去重检查
 *        ↓                    ↓
 * React 渲染 messages.map (key=message.id)
 *        ↓                    ↓
 * renderMessage()       messages.map()
 *        ↓                    ↓
 * StickerWrapper (发起媒体下载)
 *        ↓                    ↓
 * window.addEventListener('chatx:mediaDownloaded')
 *        ↓                    ↓
 * 下载完成 → 标记 ready
 *        ↓                    ↓
 * setIsMediaReady(true)   handleMediaDownloaded()
 *        ↓                    ↓
 * 正常渲染（img/video）
 *        ↓                    ↓
 * <img src={src}>       render()
 *        ↓                    ↓
 * TGSSticker 则跳过下载，直接渲染
 *        ↓                    ↓
 * TGSSticker()          loadTGS() - 直接发起 fetch
 *
 * =====================================================
 */

// 判断是否为TGS动画贴纸文件
const isTGSFile = (url: string): boolean => {
  return url.endsWith('.tgs');
};

// 辅助函数：验证并清理 src 属性，防止空字符串导致性能问题
const validateSrc = (src: string, fallback: string = '/placeholder.svg'): string => {
  // 基础清理 + 去引号 + 去编码引号
  let cleaned = src?.trim() || '';
  try { cleaned = decodeURIComponent(cleaned) } catch {}
  cleaned = cleaned.replace(/^['"]+|['"]+$/g, '')
  cleaned = cleaned.replace(/%22/gi, '')
  // console.log(`🔍 [validateSrc] 原始src: "${src}", 清理后: "${cleaned}"`);
  
  // 若文本中包含图片URL并带有多余字符（如"吧"或标点），提取第一个有效图片URL
  const imgUrlMatch = cleaned.match(/(https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|gif|webp)|\/api\/media\/[^\s"']+\.(?:jpg|jpeg|png|gif|webp))/i);
  if (imgUrlMatch) {
    cleaned = imgUrlMatch[1];
  }
  
  // 检查是否是无效的占位符文本
  if (cleaned.includes('🖼️') || cleaned.includes('Icon.jpeg') || cleaned.includes('[image]')) {
    console.warn(`⚠️ [validateSrc] 检测到无效的图片src: "${cleaned}", 使用fallback`);
    return fallback;
  }
  
  return cleaned.length > 0 ? cleaned : fallback;
};

// 视频播放器组件，支持加载状态控制
interface VideoPlayerProps {
  src: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src }) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [videoSrc, setVideoSrc] = React.useState<string | null>(null);
  const [downloadCompleted, setDownloadCompleted] = React.useState(false);

  React.useEffect(() => {
    if (src) {
      setIsLoading(true);   // 切换新视频 → 重置 loading
      setDownloadCompleted(false); // 重置下载完成状态
      setVideoSrc(src);     // 更新视频地址
    }
  }, [src]);

    // 监听媒体下载完成通知
  React.useEffect(() => {
    const handleMediaDownloaded = (data: any) => {
      console.log('📨 收到媒体下载通知:', data);
      // 提取视频URL的路径部分（去掉域名和查询参数）
      const videoSrcPath = videoSrc?.split('?')[0]?.split('/api/media')[1] || '';
      
      // 更精确的匹配：检查文件路径是否包含视频路径，或者检查messageId是否匹配
      const isPathMatch = data?.filePath && videoSrcPath && data.filePath.includes(videoSrcPath);
      const isMessageIdMatch = data?.messageId && videoSrc && videoSrc.includes(data.messageId);
      
      console.log('🔍 检查匹配条件:', {
        dataFilePath: data?.filePath,
        currentVideoSrc: videoSrc,
        videoSrcPath: videoSrcPath,
        dataMessageId: data?.messageId,
        isPathMatch: isPathMatch,
        isMessageIdMatch: isMessageIdMatch,
        finalMatch: isPathMatch || isMessageIdMatch
      });

      if (data && data.filePath && (isPathMatch || isMessageIdMatch)) {
        console.log('🎬 视频下载完成通知匹配成功:', data);
        setDownloadCompleted(true); // 标记下载完成
        // 添加时间戳防止缓存
        setVideoSrc(`${data.filePath}?t=${Date.now()}`);
        console.log('✅ 视频下载状态已更新');
      } else {
        console.log('❌ 视频下载通知不匹配或缺少必要信息');
      }
    };

    // 监听全局媒体下载事件
    window.addEventListener('chatx:mediaDownloaded', handleMediaDownloaded);

    return () => {
      window.removeEventListener('chatx:mediaDownloaded', handleMediaDownloaded);
    };
  }, [videoSrc, downloadCompleted]);

  // 监听视频加载完成事件
  const handleVideoLoadedData = React.useCallback(() => {
    console.log('🎬 视频onLoadedData事件触发');
    console.log('📊 当前状态:', { downloadCompleted, isLoading });

    // 智能判断：如果下载已完成或者视频已经可以播放，隐藏loading
    if (downloadCompleted || videoSrc) {
      console.log('✅ 视频加载完成，隐藏loading');
      setIsLoading(false);
    } else {
      console.log('⚠️ 视频元数据加载完成，但下载未完成，等待下载通知...');
      // 给服务器一些时间完成下载
      setTimeout(() => {
        if (downloadCompleted) {
          console.log('⏰ 延迟检查：下载已完成，隐藏loading');
          setIsLoading(false);
        } else {
          console.log('⚠️ 延迟检查：下载仍未完成，继续显示loading');
        }
      }, 2000); // 2秒延迟检查
    }
  }, [downloadCompleted, videoSrc]);

  return (
    <div className="video-wrapper">
      {isLoading && (
        <div
          style={{
            width: "100%",
            height: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
            color: "#666",
            fontSize: "14px",
          }}
        >
          🎬 视频加载中...
        </div>
      )}

      {videoSrc && (
        <video
          key={videoSrc} // 👈 关键：强制 React 重新渲染新视频
          className="max-w-full h-auto rounded-lg max-h-64"
          controls
          poster="/placeholder.svg"
          src={videoSrc}
          onLoadedData={handleVideoLoadedData}
          onError={(e) => {
            console.log('视频加载失败:', videoSrc);
            console.log('视频消息详情:', {
              src: videoSrc,
              errorElement: e.currentTarget
            });
            setIsLoading(false);
            e.currentTarget.style.display = 'none';
          }}
          onLoadStart={() => {
            console.log('开始加载视频文件:', videoSrc);
          }}
          onCanPlay={() => {
            console.log('视频文件加载完成，可以播放');
          }}
          style={{ width: "100%", display: isLoading ? "none" : "block" }}
        >
          您的浏览器不支持视频播放
        </video>
      )}
    </div>
  );
};

// 贴纸包装组件 - 处理媒体下载监听和渲染
interface StickerWrapperProps {
  src: string;
  messageId?: string;
  type: 'tgs' | 'webp';
  className?: string;
  onLoad?: () => void;
  onError?: (error: any) => void;
}

const StickerWrapper: React.FC<StickerWrapperProps> = ({ src, messageId, type, className = "", onLoad, onError }) => {
  const { t } = useLanguage()
  const [isMediaReady, setIsMediaReady] = React.useState(false);

  React.useEffect(() => {
    const handleMediaDownloaded = (data: any) => {
      if (data?.messageId === messageId && data?.mediaType === 'sticker') {
        setIsMediaReady(true);
      }
    };

    window.addEventListener('chatx:mediaDownloaded', handleMediaDownloaded);
    return () => window.removeEventListener('chatx:mediaDownloaded', handleMediaDownloaded);
  }, [messageId]);

  if (type === 'tgs') {
    return (
      <TGSSticker
        src={src}
        className={className}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  return <img src={src} alt={t('attachment.sticker')} className={className} />;
};

// TGS动画贴纸渲染组件
interface TGSStickerProps {
  src: string;
  className?: string;
  onLoad?: () => void;
  onError?: (error: any) => void;
}

const TGSSticker: React.FC<TGSStickerProps> = ({ src, className = "", onLoad, onError }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const animationRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const loadTGS = async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const compressedData = new Uint8Array(arrayBuffer);

        // 检查是否是gzip格式
        if (compressedData.length < 2 || compressedData[0] !== 0x1F || compressedData[1] !== 0x8B) {
          // 如果不是gzip格式，尝试多种解析方式
          console.log(`🎭 [TGS调试] 不是gzip格式，尝试多种解析方式`);
          
          // 方式1: 直接解析为JSON
          try {
            const jsonString = new TextDecoder('utf-8').decode(compressedData);
            console.log(`🎭 [TGS调试] 尝试直接JSON解析，前100字符:`, jsonString.substring(0, 100));
            const lottieData = JSON.parse(jsonString);
            
            animationRef.current = lottie.loadAnimation({
              container: containerRef.current!,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              animationData: lottieData
            });
            console.log(`🎭 [TGS调试] 直接JSON解析成功`);
            return;
          } catch (jsonError) {
            console.log(`🎭 [TGS调试] 直接JSON解析失败:`, jsonError instanceof Error ? jsonError.message : String(jsonError));
          }

          // 方式2: 尝试作为二进制数据查找JSON部分
          try {
            const textDecoder = new TextDecoder('utf-8', { fatal: false });
            const text = textDecoder.decode(compressedData);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              console.log(`🎭 [TGS调试] 在二进制数据中找到JSON，前100字符:`, jsonMatch[0].substring(0, 100));
              const lottieData = JSON.parse(jsonMatch[0]);
              
              animationRef.current = lottie.loadAnimation({
                container: containerRef.current!,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                animationData: lottieData
              });
              console.log(`🎭 [TGS调试] 二进制JSON解析成功`);
              return;
            }
          } catch (binaryError) {
            console.log(`🎭 [TGS调试] 二进制JSON解析失败:`, binaryError instanceof Error ? binaryError.message : String(binaryError));
          }

          // 方式3: 尝试不同的解压缩算法
          try {
            console.log(`🎭 [TGS调试] 尝试其他解压缩算法`);
            // 尝试zlib解压
            const decompressedData = pako.inflate(compressedData, { to: 'string' });
            const lottieData = JSON.parse(decompressedData);
            
            animationRef.current = lottie.loadAnimation({
              container: containerRef.current!,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              animationData: lottieData
            });
            console.log(`🎭 [TGS调试] zlib解压成功`);
            return;
          } catch (zlibError) {
            console.log(`🎭 [TGS调试] zlib解压失败:`, zlibError instanceof Error ? zlibError.message : String(zlibError));
          }

          // 所有方式都失败
          throw new Error(`无效的TGS文件格式: 尝试了gzip、JSON、二进制JSON和zlib解压都失败`);
        }

        // 如果是gzip格式，正常解压
        const decompressedData = pako.inflate(compressedData);
        const jsonString = new TextDecoder('utf-8').decode(decompressedData);
        const lottieData = JSON.parse(jsonString);

        animationRef.current = lottie.loadAnimation({
          container: containerRef.current!,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: lottieData
        });

      } catch (error) {
        console.error('🎭 [TGS加载失败]:', error);
        // 显示错误信息给用户
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 20px;
              color: #666;
              text-align: center;
              background: #f5f5f5;
              border-radius: 8px;
              border: 1px dashed #ccc;
            ">
              <div style="font-size: 24px; margin-bottom: 8px;">🎭</div>
              <div style="font-size: 14px; font-weight: 500;">{t('attachment.sticker')} 加载失败</div>
              <div style="font-size: 12px; margin-top: 4px; color: #999;">${error instanceof Error ? error.message : String(error)}</div>
            </div>
          `;
        }
      }
    };

    loadTGS();

    return () => {
      if (animationRef.current) {
        animationRef.current.destroy();
        animationRef.current = null;
      }
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className={`tgs-sticker-container ${className}`}
      style={{
        width: '100%',
        height: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '128px',
        maxHeight: '128px'
      }}
    />
  );
};

// 生成默认头像的函数
function generateDefaultAvatar(name: string, size: number = 40): string {
  // 获取名字的第一个字符，如果是中文则取第一个字符，如果是英文则取前两个字符
  const firstChar = name.charAt(0)
  const isChinese = /[\u4e00-\u9fa5]/.test(firstChar)
  const avatarText = isChinese ? firstChar : name.substring(0, 2).toUpperCase()

  // 生成随机背景色
  const colors = [
    'FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7',
    'DDA0DD', '98D8C8', 'F7DC6F', 'BB8FCE', '85C1E9'
  ]
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarText)}&size=${size}&background=${randomColor}&color=fff&bold=true`
}

// 头像组件，带 fallback 机制
const AvatarWithFallback = ({ src, name, className = "w-8 h-8 rounded-full" }: {
  src?: string,
  name: string,
  className?: string
}) => {
  const [imgSrc, setImgSrc] = React.useState(src || generateDefaultAvatar(name))
  const [hasError, setHasError] = React.useState(false)

  React.useEffect(() => {
    setImgSrc(src || generateDefaultAvatar(name))
    setHasError(false)
  }, [src, name])

  const handleError = () => {
    if (!hasError) {
      setHasError(true)
      setImgSrc(generateDefaultAvatar(name))
    }
  }

  return (
    <img
      src={imgSrc}
      alt={name}
      className={className}
      onError={handleError}
    />
  )
}

// // 模拟用户数据（用于右侧用户信息面板）
// const getSelectedUser = (t: (key: string) => string) => ({
//   name: t("user.zhang_xiaoming"),
//   username: "@zhangxiaoming",
//   avatar: `/placeholder.svg?height=80&width=80&text=${t("user.zhang_avatar")}`,
//   platform: "whatsapp",
//   phone: "+86 138****8888",
//   email: "zhang@example.com",
//   tags: [t("user.vip_customer"), t("user.potential_buyer")],
//   joinDate: "2024-01-15",
//   lastActive: "2 minutes ago",
//   status: "online",
//   notes: t("user.interested_smartwatches"),
// })

export function AllChatsView() {
  const { t } = useLanguage()
  
  // 添加音波动画样式
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wave {
        0% { transform: scaleY(0.3); }
        100% { transform: scaleY(1); }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [chats, setChats] = React.useState<ChatInfo[]>([])
  const [selectedChat, setSelectedChat] = React.useState<ChatInfo | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [searchTerm, setSearchTerm] = React.useState("")
  const [platformFilter, setPlatformFilter] = React.useState<string>("all")
  const [accountFilter, setAccountFilter] = React.useState<string[]>([])
  const [accounts, setAccounts] = React.useState<AccountInfo[]>([])
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set())
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = React.useState(false)
  const [accountSearchTerm, setAccountSearchTerm] = React.useState("")
  const [selectedGroupAccount, setSelectedGroupAccount] = React.useState<Record<string, string>>({})
  const [pendingMessage, setPendingMessage] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(true)
  const [isMessagesLoading, setIsMessagesLoading] = React.useState(false)
  // 默认使用真实数据（移除虚拟数据开关）
  
  // 文件上传和语音录制相关状态
  const [isRecording, setIsRecording] = React.useState(false)
  const [mediaRecorder, setMediaRecorder] = React.useState<MediaRecorder | null>(null)
  const [recordedChunks, setRecordedChunks] = React.useState<Blob[]>([])
  const [recordedAudio, setRecordedAudio] = React.useState<Blob | null>(null)
  const [recordingDuration, setRecordingDuration] = React.useState(0)
  const [audioLevel, setAudioLevel] = React.useState(0)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const recordingIntervalRef = React.useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)
  
  // Emoji 选择器状态
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  
  // 文件上传下拉菜单状态
  const [showFileDropdown, setShowFileDropdown] = React.useState(false)
  const [downloadingStates, setDownloadingStates] = React.useState<Record<string, boolean>>({})
  // 用于自动滚动到最新消息
  const messagesContainerRef = React.useRef<HTMLDivElement | null>(null)
  // 基于 fileHash 的去重检测（仅调试日志使用）
  const seenFileHashesRef = React.useRef<Set<string>>(new Set())
  // （简化）移除复杂缓存，避免重复更新
  const fileNameCacheRef = React.useRef<Map<string, string>>(new Map())

  // 内联子组件：根据 Content-Disposition 懒取文件名并写回消息
  const DocumentNameFetcher: React.FC<{ messageId: string; docUrl: string; hintedName?: string }>
    = ({ messageId, docUrl, hintedName }) => {
    React.useEffect(() => {
      if (!docUrl) return;
      if (hintedName && hintedName.trim()) return; // 已有文件名
      const cacheKey = docUrl;
      if (fileNameCacheRef.current.has(cacheKey)) {
        const cached = fileNameCacheRef.current.get(cacheKey)!;
        if (cached && cached.trim()) {
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, fileName: cached } : m));
          return;
        }
      }
      let aborted = false;
      const fetchName = async () => {
        try {
          // 用 HEAD 优先尝试，若被阻止则退回 GET 但不读取大数据
          const res = await fetch(docUrl, { method: 'HEAD' });
          const cd = res.headers.get('content-disposition') || '';
          let name = '';
          const matchUtf = cd.match(/filename\*=UTF-8''([^;]+)$/i);
          const matchBasic = cd.match(/filename="?([^";]+)"?/i);
          if (matchUtf && matchUtf[1]) name = decodeURIComponent(matchUtf[1]);
          else if (matchBasic && matchBasic[1]) name = matchBasic[1];
          if (!name) return;
          if (aborted) return;
          fileNameCacheRef.current.set(cacheKey, name);
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, fileName: name } : m));
          console.log('[FILENAME:resolved]', { messageId, name, from: 'Content-Disposition' });
        } catch (e) {
          // 忽略网络失败
        }
      };
      fetchName();
      return () => { aborted = true; };
    }, [messageId, docUrl, hintedName]);
    return null;
  };

  // 处理文件下载（无跳转页面）
  const handleDownload = React.useCallback(async (url: string, fileName?: string) => {
    try {

      // 设置下载状态
      const messageId = url.split('/').pop()?.split('.')[0] || 'unknown';
      setDownloadingStates(prev => ({ ...prev, [messageId]: true }));

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      // 生成下载文件名
      const downloadFileName = fileName || url.split('/').pop() || 'downloaded_file';

      // 创建临时下载链接
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // 释放URL对象
      window.URL.revokeObjectURL(downloadUrl);

      // 下载完成

    } catch (error) {
      console.error('❌ 文件下载失败:', error);
    } finally {
      // 清除下载状态
      const messageId = url.split('/').pop()?.split('.')[0] || 'unknown';
      setDownloadingStates(prev => ({ ...prev, [messageId]: false }));
    }
  }, []);


  // 账户筛选（左侧）：工作空间标签 + 品牌多选
  const [accountFilterDropdownOpen, setAccountFilterDropdownOpen] = React.useState(false)
  const [accountFilterTabKey, setAccountFilterTabKey] = React.useState<string>('')
  const accountFilterRef = React.useRef<HTMLDivElement | null>(null)
  const [workspacesForFilter, setWorkspacesForFilter] = React.useState<{ key: string; label: string }[]>([])
  const [brandsByWorkspace, setBrandsByWorkspace] = React.useState<Record<string, { id: number; name: string }[]>>({})
  const [selectedBrandsByWs, setSelectedBrandsByWs] = React.useState<Record<string, string[]>>({})

  // 动态加载可见的工作区与品牌
  React.useEffect(() => {
    (async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_BASE as string
        // 获取当前用户
        const meRes = await fetchWithAuth(`${API_BASE}/auth/me`, { credentials: 'include' })
        if (!meRes.ok) return
        const meJson = await meRes.json()
        const userId = meJson?.user?.id
        if (!userId) return

        // 获取可见的工作区与品牌
        const wsRes = await fetchWithAuth(`${API_BASE}/workspace/user/${userId}/workspaces-brands`, { credentials: 'include' })
        if (!wsRes.ok) return
        const wsJson = await wsRes.json()
        const rows: { workspace_id: number; workspace_name: string; brands: { id: number; name: string }[] }[] = wsJson?.workspaces || []

        const ws = rows.map(r => ({ key: String(r.workspace_id), label: r.workspace_name }))
        const brandMap: Record<string, { id: number; name: string }[]> = {}
        const selectedInit: Record<string, string[]> = {}
        rows.forEach(r => {
          brandMap[String(r.workspace_id)] = r.brands || []
          selectedInit[String(r.workspace_id)] = []
        })

        setWorkspacesForFilter(ws)
        setBrandsByWorkspace(brandMap)
        setSelectedBrandsByWs(selectedInit)
        // 默认选中第一个工作区 Tab
        if (ws.length > 0) setAccountFilterTabKey(ws[0].key)
      } catch (e) {
        // 静默失败，保持空
      }
    })()
  }, [])

  const getCurrentBrands = () => brandsByWorkspace[accountFilterTabKey]?.map(b => b.name) || []
  const getSelectedBrands = () => selectedBrandsByWs[accountFilterTabKey] || []
  const setSelectedBrands = (next: string[]) =>
    setSelectedBrandsByWs(prev => ({ ...prev, [accountFilterTabKey]: next }))

  // 按钮高亮条件：打开或已有选中项
  const hasAccountFilterActive = React.useMemo(() => {
    return Object.values(selectedBrandsByWs).some(arr => (arr && arr.length > 0))
  }, [selectedBrandsByWs])

  // 点击外部或按 ESC 关闭 Account Filter 下拉
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!accountFilterDropdownOpen) return
      const target = e.target as Node
      if (accountFilterRef.current && !accountFilterRef.current.contains(target)) {
        setAccountFilterDropdownOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!accountFilterDropdownOpen) return
      if (e.key === 'Escape') setAccountFilterDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountFilterDropdownOpen])
 
  const filteredAccounts = React.useMemo(() => {
    // 1️⃣ Only active accounts
    let result = accounts.filter(acc => acc.isActive);
  
    // 2️⃣ Extract selected workspaces & brands
    const selectedWorkspaceIds = Object.entries(selectedBrandsByWs)
      .filter(([, brands]) => brands.length > 0)
      .map(([wsId]) => Number(wsId));
  
    const selectedBrandIds = Object.values(selectedBrandsByWs)
      .flatMap(brands =>
        Object.entries(brandsByWorkspace)
          .flatMap(([, brandList]) =>
            brandList
              .filter(b => brands.includes(b.name))
              .map(b => b.id)
          )
      );
  
    // 3️⃣ Apply filters — if empty, means "show all"
    if (selectedWorkspaceIds.length > 0) {
      result = result.filter(acc => selectedWorkspaceIds.includes(acc.workspaceId));
    }
  
    if (selectedBrandIds.length > 0) {
      result = result.filter(acc => selectedBrandIds.includes(acc.brandId));
    }
  
    // 4️⃣ Platform filter (if needed)
    if (platformFilter !== "all") {
      result = result.filter(acc => acc.platform === platformFilter);
    }
  
    console.log("✅ Filtered Accounts:", result);
    return result;
  }, [accounts, selectedBrandsByWs, brandsByWorkspace, platformFilter]);

  
  // 记录调试数据
  const recordDebugData = React.useCallback((label: string, data: any) => {
    console.log(`🔍 [调试] ${label}:`, data)
    if (typeof window !== 'undefined') {
      if (!(window as any).__CHATX_DEBUG) {
        (window as any).__CHATX_DEBUG = {}
      }
      (window as any).__CHATX_DEBUG[label] = data
    }
  }, [])

  // 加载账户列表
  const loadAccounts = React.useCallback(async () => {
    try {
      // 使用真实API数据
      try {
        const response = await AccountManagementApi.getAccounts()
        const accounts = response || []
        setAccounts(accounts)
        console.log('🔍 [调试] 使用真实账户数据:', accounts.length)
      } catch (apiError) {
        console.error("❌ [loadAccounts] AccountManagementApi.getAccounts() 失败:", apiError)
        // 如果API失败，回退到模拟数据
    setAccounts(mockAccounts)
        console.log('🔄 [调试] API失败，回退到模拟账户数据')
      }
    } catch (error) {
      console.error('❌ [loadAccounts] 加载账户列表失败:', error)
      setAccounts([])
    }
  }, [])

  // 获取当前聊天对应的账户ID
  const getCurrentAccountIdForChat = React.useCallback((chat: ChatInfo, selectedGroupAccount: Record<string, string>, allChats: ChatInfo[]) => {
    if (chat.type === 'group' && chat.groupId && selectedGroupAccount[chat.groupId]) {
      return selectedGroupAccount[chat.groupId]
    }
    return chat.accountId
  }, [])

  // 清理无效的账户选择
  React.useEffect(() => {
    const validAccountIds = filteredAccounts.map(acc => acc.id)
    setAccountFilter(prev => prev.filter(id => validAccountIds.includes(id)))
  }, [filteredAccounts])

  // 将后端返回的头像地址规范化：支持绝对URL与后端相对路径 /avatars/...
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE as string
  const resolveImageUrl = React.useCallback((url?: string) => {
    if (!url) return '/placeholder.svg'
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('/')) return `${API_BASE}${url}`
    return url
  }, [API_BASE])

  // 统一解析媒体URL，修复 undefined/api/... 并补全域名
  const resolveMediaUrl = React.useCallback((url?: string) => {
    if (!url) return ''
    const trimmed = url.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    if (trimmed.startsWith('/')) return `${API_BASE}${trimmed}`
    // 兼容后端返回 "undefined/api/..." 的情况
    if (trimmed.startsWith('undefined/api/')) return `${API_BASE}${trimmed.replace('undefined', '')}`
    // 其他相对路径，原样返回
    return trimmed
  }, [API_BASE])

  // 组织聊天数据 - 保持全局顺序混排
  const organizeChats = React.useCallback((chatList: ChatInfo[]) => {
    type GroupCard = { type: 'group', groupId: string, chats: ChatInfo[] }
    const isGroupCard = (item: ChatInfo | GroupCard): item is GroupCard =>
      (item as any)?.chats !== undefined

    const processedGroupIds = new Set<string>()
    const combined: (ChatInfo | GroupCard)[] = []

    for (const chat of chatList) {
      if (chat.type !== 'group' || !chat.groupId) {
        combined.push(chat)
        continue
      }

      const groupId = chat.groupId
      if (processedGroupIds.has(groupId)) {
        continue
      }

      const groupChats = chatList.filter(c => c.groupId === groupId)
      if (groupChats.length === 0) {
        combined.push(chat)
        processedGroupIds.add(groupId)
        continue
      }

        const memberCount = groupChats[0]?.memberCount
        if (memberCount === 1) {
        combined.push(groupChats[0])
        } else {
        combined.push({ type: 'group', groupId, chats: groupChats })
      }

      processedGroupIds.add(groupId)
    }

    // 统一排序：按 lastMessageTime（群组使用成员最大时间）
    const getTime = (item: ChatInfo | GroupCard) =>
      isGroupCard(item)
        ? Math.max(...item.chats.map((c: ChatInfo) => c.lastMessageTime || 0))
        : ((item as ChatInfo).lastMessageTime || 0)

    combined.sort((a, b) => getTime(b) - getTime(a))

    return combined
  }, [])

  // 处理群组展开/收起
  const handleGroupToggle = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  // 处理群组内账号切换
  const handleGroupAccountSwitch = (groupId: string, accountId: string) => {
    console.log('🔍 [调试] 群组账号切换:', { groupId, accountId })
    setSelectedGroupAccount(prev => {
      const newState = {
        ...prev,
        [groupId]: accountId
      }
      console.log('🔍 [调试] 更新后的 selectedGroupAccount:', newState)
      return newState
    })
  }

  // 获取过滤后的账户列表（用于下拉菜单）
  // const getFilteredAccountsForDropdown = React.useCallback(() => {
  //   return filteredAccounts.filter(account => {
  //     const matchesSearch = accountSearchTerm === "" ||
  //       account.displayName.toLowerCase().includes(accountSearchTerm.toLowerCase()) ||
  //       (account.phoneNumber && account.phoneNumber.includes(accountSearchTerm)) ||
  //       (account.username && account.username.toLowerCase().includes(accountSearchTerm.toLowerCase()))

  //     const matchesPlatform = platformFilter === "all" || account.platform === platformFilter

  //     return matchesSearch && matchesPlatform
  //   })
  // }, [filteredAccounts, accountSearchTerm, platformFilter])
  

  // 加载聊天列表
  const loadChats = React.useCallback(async () => {
      setIsLoading(true)

    try {
      // 使用真实API数据
      try {
        const response = await ChatApi.getAllChats()
        setChats(response.chats || [])
        console.log('🔍 [调试] 使用真实聊天数据:', response.chats?.length || 0)
      } catch (apiError) {
        console.error("❌ [loadChats] ChatApi.getAllChats() 失败:", apiError)
        // 如果API失败，回退到模拟数据
        setChats(mockChats)
        console.log('🔄 [调试] API失败，回退到模拟数据')
      }
    } catch (error) {
      console.error('❌ [loadChats] 加载聊天列表失败:', error)
      setChats([])
    } finally {
      setIsLoading(false)
    }

    // 如果有聊天且没有选中的聊天，选中第一个
    const currentChats = (chats.length > 0 ? chats : [])
    if (currentChats.length > 0 && !selectedChat) {
      const firstChat = currentChats[0]
      setSelectedChat(firstChat)
      // 如果是群组且有多个账号，默认选择第一个账号
      if (firstChat.type === 'group' && firstChat.groupId) {
        const groupChats = currentChats.filter(c => c.groupId === firstChat.groupId)
        if (groupChats.length > 1) {
          setSelectedGroupAccount(prev => ({
            ...prev,
            [firstChat.groupId!]: groupChats[0].accountId
          }))
        }
      }
      loadChatMessages(firstChat.id)
    }
  }, [selectedChat])

  //（简化）暂不处理 mediaDownloaded 合并，避免前端重复更新

  // 加载聊天消息
  const loadChatMessages = React.useCallback(async (chatId: string) => {
    setIsMessagesLoading(true)

    try {
      // 使用真实API数据
      try {
        const response = await ChatApi.getChatMessages(chatId, 50)
        const sorted = [...(response.messages || [])].sort((a: ChatMessage, b: ChatMessage) => (a.timestamp || 0) - (b.timestamp || 0))
        setMessages(sorted)
        console.log('🔍 [调试] 使用真实消息数据:', chatId, response.messages?.length || 0)
      } catch (apiError) {
        console.error("❌ [loadChatMessages] ChatApi.getChatMessages() 失败:", apiError)
        // 如果API失败，回退到模拟数据
    const chatMessages = mockMessages[chatId] || []
    const sorted = [...chatMessages].sort((a: ChatMessage, b: ChatMessage) => (a.timestamp || 0) - (b.timestamp || 0))
    setMessages(sorted)
        console.log('🔄 [调试] API失败，回退到模拟消息数据')
      }
    } catch (error) {
      console.error('❌ [loadChatMessages] 加载聊天消息失败:', error)
      setMessages([])
    } finally {
    setIsMessagesLoading(false)
    }

    // 等 DOM 更新后滚动到底部，显示最新消息
    requestAnimationFrame(() => {
      const el = messagesContainerRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
  }, [])

  // ✅ 当消息或选中的聊天变化时自动滚动
React.useEffect(() => {
  const el = messagesContainerRef.current;
  if (!el || messages.length === 0) return;

  const lastMessage = messages[messages.length - 1];

  // 小延时确保布局完成
  const id = window.setTimeout(() => {
    if (lastMessage?.messageType === "system") {
      // ✅ 居中显示系统消息（瞬间）
      el.scrollTo({
        top: el.scrollHeight / 2 - el.clientHeight / 2,
        behavior: "instant",
      });
    } else {
      // ✅ 普通消息滚动到底部（自然）
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, 0);

  return () => window.clearTimeout(id);
}, [messages, selectedChat]);

  // 发送消息
  const handleSendMessage = async () => {
    if (!selectedChat || !pendingMessage.trim()) return;

    const messageContent = pendingMessage.trim();
    setPendingMessage(""); // Clear input immediately

    let targetChatId = selectedChat.id;
    let targetAccountId = selectedChat.accountId;

    // If it's a grouped chat, determine the actual chat ID to send to
    if (selectedChat.type === 'group' && selectedChat.groupId) {
      const currentSendingAccount = getCurrentAccountIdForChat(selectedChat, selectedGroupAccount, chats);
      if (currentSendingAccount) {
        const subChat = chats.find(c => c.groupId === selectedChat.groupId && c.accountId === currentSendingAccount);
        if (subChat) {
          targetChatId = subChat.id;
          targetAccountId = subChat.accountId;
        }
      }
    }

    try {
      console.log(`📤 [API] 发送消息到 ${targetChatId} (账号: ${targetAccountId})`);
      const success = await ChatApi.sendMessage(targetChatId, messageContent);
      if (success) {
        console.log(`✅ [API] 消息发送成功到 ${targetChatId}`);
        
        // 本地添加消息，立即显示，提升用户体验
        const newMessage: ChatMessage = {
          id: `temp-${Date.now()}`, // 临时ID，WebSocket推送时会替换
          chatId: targetChatId,
          sender: t("user.you"),
          senderName: t("user.you"),
          content: messageContent,
          timestamp: Date.now(),
          isOwn: true,
          messageType: 'text',
          status: 'sent'
        };
        setMessages(prev => [...prev, newMessage]);
        
        // 滚动到底部显示新消息
        setTimeout(() => {
          const messagesContainer = document.querySelector('.messages-container');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 100);
        
        // 完全依赖 WebSocket 实时更新，不调用 loadChatMessages
      } else {
        console.error(`❌ [API] 消息发送失败到 ${targetChatId}`);
        // 发送失败时显示错误提示
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          chatId: targetChatId,
          sender: t("common.system"),
          senderName: t("common.system"),
          content: t("chat.send_failed_retry"),
          timestamp: Date.now(),
          isOwn: false,
          messageType: "text",
          status: "failed",
        };
        setMessages(prev => [...prev, errorMessage]);
      }
      
      // 更新聊天列表中的最后消息
      setChats(prevChats => prevChats.map(c =>
        c.id === selectedChat.id ? { ...c, lastMessage: messageContent, lastMessageTime: Date.now() } : c
      ));
    } catch (error) {
      console.error(`❌ [API] 发送消息异常:`, error);
      // 发生错误时也使用本地模拟消息
      const newMessage: ChatMessage = {
        id: `mock-msg-${Date.now()}`,
        chatId: targetChatId,
        sender: t("user.you"), // Placeholder for current user
        senderName: t("user.you"),
        content: messageContent,
        timestamp: Date.now(),
        isOwn: true,
        messageType: "text",
        status: "sent",
      };
      setMessages(prev => [...prev, newMessage]);
      // Optionally update last message of the chat in the list
      setChats(prevChats => prevChats.map(c =>
        c.id === selectedChat.id ? { ...c, lastMessage: messageContent, lastMessageTime: Date.now() } : c
      ));
    }
  };

  // 根据文件类型确定消息类型
  const getMessageTypeFromFile = (file: File): 'photo' | 'video' | 'document' => {
    if (file.type.startsWith('image/')) {
      return 'photo';
    } else if (file.type.startsWith('video/')) {
      return 'video';
    } else {
      return 'document';
    }
  };

  // 根据文件类型获取图标
  const getFileIcon = (file: File): string => {
    if (file.type.startsWith('image/')) {
      return '🖼️';
    } else if (file.type.startsWith('video/')) {
      return '🎥';
    } else if (file.type.startsWith('audio/')) {
      return '🎵';
    } else {
      return '📎';
    }
  };

  // 处理文件选择
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedChat) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const messageType = getMessageTypeFromFile(file);
      const fileIcon = getFileIcon(file);
      
      // 🔍 详细的文件名验证和日志
      // console.log(`📁 [文件上传] 选择文件详情:`, {
      //   originalName: file.name,
      //   fileSize: file.size,
      //   fileType: file.type,
      //   lastModified: file.lastModified,
      //   messageType: messageType,
      //   isFile: file instanceof File,
      //   constructor: file.constructor.name
      // });
      
      // 验证文件名是否有效
      if (!file.name || file.name.trim() === '') {
        console.error('❌ [文件验证] 文件名无效:', file.name);
        alert('文件名无效，请重新选择文件');
        continue;
      }
      
      // 验证文件大小
      if (file.size === 0) {
        console.error('❌ [文件验证] 文件大小为0:', file.name);
        alert('文件为空，请重新选择文件');
        continue;
      }
      
      console.log(`✅ [文件验证] 文件验证通过: ${file.name}`);
      
      // 先显示上传中的消息
      const tempMessageId = `file-msg-${Date.now()}-${i}`;
      const tempMessage: ChatMessage = {
        id: tempMessageId,
        chatId: selectedChat.id,
        sender: "You",
        senderName: "You",
        content: `${fileIcon} ${file.name} (${t('common.uploading')})`,
        timestamp: Date.now(),
        isOwn: true,
        messageType: messageType,
        status: "sent",
      };
      setMessages(prev => [...prev, tempMessage]);

      try {
        // 🔍 发送前的最终验证
        // console.log(`📤 [文件发送] 准备发送文件:`, {
        //   chatId: selectedChat.id,
        //   fileName: file.name,
        //   fileSize: file.size,
        //   fileType: file.type,
        //   messageType: messageType,
        //   additionalData: {
        //     fileName: file.name,
        //     fileSize: file.size
        //   }
        // });
        
        // 发送文件到后端
        const response = await ChatApi.sendMessage(
          selectedChat.id,
          '', // 不发送文件名作为内容，避免对方收到照片名字
          messageType,
          file,
          {
            fileName: file.name,
            fileSize: file.size
          }
        );

        if (response?.success) {
          console.log(`✅ [文件上传] 文件发送成功: ${file.name}`, response);
          const returnedUrl = response.fileUrl || '';
          const returnedType = (response.messageType as ChatMessage['messageType']) || messageType;
          const returnedFileName = (response as any)?.fileName as string | undefined;
          const returnedFileHash = (response as any)?.fileHash as string | undefined;
          console.log('[DEDUP:sendSuccess]', {
            tempMessageId,
            returnedUrl,
            returnedType,
            returnedFileName,
            returnedFileHash
          });
          setMessages(prev => prev.map(msg => {
            if (msg.id !== tempMessageId) return msg;
            if (returnedUrl && (returnedType === 'photo' || returnedType === 'video' || returnedType === 'voice' || returnedType === 'document')) {
              return { ...msg, content: returnedUrl, messageType: returnedType, status: 'delivered' as const, ...(returnedFileName ? { fileName: returnedFileName } : {}), ...(returnedFileHash ? { fileHash: returnedFileHash } : {}) };
            }
            return { ...msg, status: 'delivered' as const, ...(returnedFileName ? { fileName: returnedFileName } : {}), ...(returnedFileHash ? { fileHash: returnedFileHash } : {}) };
          }));
        } else {
          console.error(`❌ [文件上传] 文件发送失败: ${file.name}`);
          // 更新消息状态为失败
          setMessages(prev => prev.map(msg => 
            msg.id === tempMessageId 
              ? { ...msg, content: `${fileIcon} ${file.name} (${t('common.send_failed')})`, status: "sent" as const }
              : msg
          ));
        }
      } catch (error) {
        console.error(`❌ [文件上传] 文件上传异常:`, error);
        // 更新消息状态为失败
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessageId 
            ? { ...msg, content: `${fileIcon} ${file.name} (上传失败)`, status: "sent" as const }
            : msg
        ));
      }
    }
    
    // 清空文件输入
    event.target.value = '';
  };

  // 处理语音录制
  const handleVoiceRecord = async () => {
    if (!selectedChat) return;

    if (!isRecording) {
      // 开始录制
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 智能格式选择 - 后端会使用 ffmpeg 转换为 OGG/Opus
        let mimeType = 'audio/ogg; codecs=opus';
        let format = 'ogg';
        
        // 检测浏览器信息
        const userAgent = navigator.userAgent;
        const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Edge');
        const isEdge = userAgent.includes('Edge');
        const isFirefox = userAgent.includes('Firefox');
        const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
        
        // console.log(`🌐 [浏览器检测] User Agent: ${userAgent}`);
        // console.log(`🌐 [浏览器检测] 检测结果: Chrome=${isChrome}, Edge=${isEdge}, Firefox=${isFirefox}, Safari=${isSafari}`);
        
        // 检查格式支持，按优先级选择
        const supportedFormats = [
          'audio/ogg; codecs=opus',  // 最佳：OGG + Opus
          'audio/webm; codecs=opus', // 次佳：WebM + Opus  
          'audio/webm',              // 备选：WebM
          'audio/mp4',               // 最后：MP4
        ];
        
        // console.log(`🔍 [格式检测] 检查浏览器支持的音频格式:`);
        for (const testFormat of supportedFormats) {
          const isSupported = MediaRecorder.isTypeSupported(testFormat);
          // console.log(`  ${testFormat}: ${isSupported ? '✅ 支持' : '❌ 不支持'}`);
        }
        
        // 选择第一个支持的格式
        for (const testFormat of supportedFormats) {
          if (MediaRecorder.isTypeSupported(testFormat)) {
            mimeType = testFormat;
            break;
          }
        }
        
        // 确定文件扩展名
        if (mimeType.includes('ogg')) {
          format = 'ogg';
        } else if (mimeType.includes('webm')) {
          format = 'webm';
        } else if (mimeType.includes('mp4')) {
          format = 'mp4';
        }
        
        console.log(`🎤 [录音] 使用格式: ${mimeType} (${format}) - 后端将自动转换为 OGG/Opus`);
        
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        // 设置音波分析
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 256;
        source.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          console.log(`🎤 [语音录制] 录制完成: ${blob.size} bytes`);
          setRecordedAudio(blob);
          
          // 停止所有音频轨道
          stream.getTracks().forEach(track => track.stop());
          
          // 清除录制计时器
          if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
          }
          
          // 停止音波分析
          stopAudioAnalysis();
        };

        recorder.start();
        setMediaRecorder(recorder);
        setRecordedChunks(chunks);
        setIsRecording(true);
        setRecordingDuration(0);
        setAudioLevel(0);
        
        // 开始计时
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        
        // 开始音波分析
        analyzeAudio();
        
        console.log(`🎤 [语音录制] 开始录制`);
      } catch (error: any) {
        console.error(`❌ [语音录制] 录制失败:`, error);
        
        // 显示用户友好的错误信息
        if (error.message?.includes('不支持 OGG 格式')) {
          alert(error.message); // 显示完整的错误信息，包含 Telegram API 要求说明
        } else if (error.message?.includes('麦克风')) {
          alert('❌ 无法访问麦克风，请检查权限设置');
        } else {
          alert(`❌ 录音失败: ${error.message || '未知错误'}`);
        }
      }
    } else {
      // 停止录制
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        setMediaRecorder(null);
        setRecordedChunks([]);
        setIsRecording(false);
        stopAudioAnalysis();
        console.log(`🎤 [语音录制] 停止录制`);
      }
    }
  };

  // 删除录制的语音
  const handleDeleteRecording = () => {
    setRecordedAudio(null);
    setRecordingDuration(0);
    setAudioLevel(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    stopAudioAnalysis();
  };


  // 发送录制的语音
  const handleSendRecording = async () => {
    if (!selectedChat || !recordedAudio) return;

    const tempMessageId = `voice-msg-${Date.now()}`;
    const durationText = `${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, '0')}`;
    
    // 先显示上传中的消息
    const tempMessage: ChatMessage = {
      id: tempMessageId,
      chatId: selectedChat.id,
      sender: "You",
      senderName: "You",
      content: `🎤 ${t('common.voice_message')} (${durationText}) (${t('common.converting')})`,
      timestamp: Date.now(),
      isOwn: true,
      messageType: "voice",
      status: "sent",
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      // 直接使用录制的 WebM 格式，后端会进行转换
      console.log(`🎤 [语音发送] 发送 WebM 格式语音: ${recordedAudio.type}, ${recordedAudio.size} bytes`);
      
      // 更新消息状态
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessageId 
          ? { ...msg, content: `🎤 ${t('common.voice_message')} (${durationText}) (${t('common.sending')})` }
          : msg
      ));
      
      // 创建 WebM 格式的 File 对象
      const audioFile = new File([recordedAudio], `voice-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      // 发送语音到后端
      console.log(`🔍 [前端] 发送语音消息:`, {
        chatId: selectedChat.id,
        chatIdType: typeof selectedChat.id,
        chatIdLength: selectedChat.id?.length,
        fileName: `voice-${Date.now()}.webm`,
        fileSize: recordedAudio.size,
        mimeType: audioFile.type
      });
      
      // 检查聊天ID格式
      if (selectedChat.id && selectedChat.id.includes('tg-tg-')) {
        // console.error(`❌ [聊天ID错误] 检测到重复前缀: ${selectedChat.id}`);
      }
      
      const response = await ChatApi.sendMessage(
        selectedChat.id,
        '', // 不发送语音描述作为内容，避免对方收到文字
        "voice",
        audioFile,
        {
          fileName: `voice-${Date.now()}.webm`,
          fileSize: recordedAudio.size
        }
      );

      console.log(`🔍 [语音消息] 完整响应:`, response);

      if (response) {
        console.log(`✅ [语音上传] 语音发送成功`);
        console.log(`🎤 [语音消息] 响应数据:`, response);
        
        // 使用后端返回的fileUrl，如果没有则使用文本描述
        const voiceContent = response.fileUrl || `🎤 ${t('common.voice_message')} (${durationText})`;
        console.log(`🎤 [语音消息] 使用内容:`, voiceContent);
        
        // 更新消息状态
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessageId 
            ? { 
                ...msg, 
                content: voiceContent, 
                status: "delivered" as const 
              }
            : msg
        ));
      } else {
        console.error(`❌ [语音上传] 语音发送失败:`, response);
        // 更新消息状态为失败
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessageId 
            ? { ...msg, content: `🎤 ${t('common.voice_message')} (${durationText}) (${t('common.send_failed')})`, status: "sent" as const }
            : msg
        ));
      }
    } catch (error) {
      console.error(`❌ [语音上传] 语音上传异常:`, error);
      // 更新消息状态为失败
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessageId 
          ? { ...msg, content: `🎤 ${t('common.voice_message')} (${durationText}) (${t('common.upload_failed')})`, status: "sent" as const }
          : msg
      ));
    }
    
    // 清除录制状态
    setRecordedAudio(null);
    setRecordingDuration(0);
  };

  // 处理emoji选择
  const handleEmojiSelect = (emoji: string) => {
    setPendingMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // 处理文件类型选择
  const handleFileTypeSelect = (type: 'document' | 'photo') => {
    if (fileInputRef.current) {
      if (type === 'document') {
        fileInputRef.current.accept = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
      } else {
        fileInputRef.current.accept = 'image/*,video/*';
      }
      fileInputRef.current.click();
    }
    setShowFileDropdown(false);
  };

  // 音波分析函数
  const analyzeAudio = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // 计算平均音量
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    setAudioLevel(average);

    // 继续分析
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  };

  // 停止音波分析
  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
    setAudioLevel(0);
  };

  // 处理聊天选择
  const handleChatSelect = (chat: ChatInfo) => {
    setSelectedChat(chat);
    // 如果是群组且有多个账号，默认选择第一个账号
    if (chat.type === 'group' && chat.groupId) {
      const groupChats = chats.filter(c => c.groupId === chat.groupId);
      if (groupChats.length > 1 && !selectedGroupAccount[chat.groupId]) {
        setSelectedGroupAccount(prev => ({
          ...prev,
          [chat.groupId!]: groupChats[0].accountId
        }));
      }
    }
    loadChatMessages(chat.id);
  };

  // 组件挂载时加载数据
  React.useEffect(() => {
    // 确保 WebSocket 已连接（若单例未自动连接，则主动触发）
    try {
      const status = websocketClient.getConnectionStatus?.();
      console.log('🔍 [WS] 初始连接状态:', status);
      if (!status?.isConnected) {
        console.log('🔌 [WS] 未连接，尝试主动连接...');
        websocketClient.connect?.();
      }
    } catch (e) {
      console.log('⚠️ [WS] 检查/连接异常:', e);
    }

    loadChats()
    loadAccounts()
    
    // 🔄 监听账号状态变化事件
    const handleAccountToggle = () => {
      console.log('🔄 收到账号状态变化事件，重新加载聊天列表')
      loadChats()
      loadAccounts()
    }
    
    // 监听账号相关事件
    window.addEventListener('accountAdded', handleAccountToggle as EventListener)
    window.addEventListener('refreshAccounts', handleAccountToggle as EventListener)
    window.addEventListener('accountDataChanged', handleAccountToggle as EventListener)
    
    // 清理事件监听器
    return () => {
      window.removeEventListener('accountAdded', handleAccountToggle as EventListener)
      window.removeEventListener('refreshAccounts', handleAccountToggle as EventListener)
      window.removeEventListener('accountDataChanged', handleAccountToggle as EventListener)
    }
  }, [loadChats, loadAccounts])

  // 当数据源切换时重新加载数据
  React.useEffect(() => {
    loadChats()
    loadAccounts()
  }, [loadChats, loadAccounts])

  // WebSocket 监听器（仅真实数据时启用）
  React.useEffect(() => {
    const handleNewMessage = (data: WebSocketMessage) => {
      console.log('📨 [WebSocket] 收到新消息:', {
        chatId: data.chatInfo?.id,
        content: data.message?.content?.substring(0, 50),
        accountId: data.accountId
      });

      setChats(prevChats => {
        const idx = prevChats.findIndex(c => c.id === data.chatInfo.id);
        const updatedChatBase = {
          ...data.chatInfo,
          lastMessage: data.message.content,
          lastMessageTime: data.message.timestamp,
          lastMessageSender: data.message.sender,
          updatedAt: Date.now()
        } as ChatInfo;

        let next: ChatInfo[];
        if (idx === -1) {
          // 新会话：插入到顶部
          next = [
            { ...updatedChatBase, unreadCount: 1 },
            ...prevChats
          ];
        } else {
          next = prevChats.map((c, i) => i === idx ? {
            ...c,
            ...updatedChatBase,
            unreadCount: (selectedChat && selectedChat.id === data.chatInfo.id) ? c.unreadCount : ((c.unreadCount || 0) + 1)
          } : c);
        }

        // 最近活跃排序（最新消息时间倒序）
        next.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
        return next;
      });

      // 正在查看该聊天时，追加消息并保持时间升序
      const isSameChat = selectedChat && selectedChat.id === data.chatInfo.id;
      const isSameGroup = selectedChat && selectedChat.type === 'group' && selectedChat.groupId && selectedChat.groupId === data.chatInfo.groupId;
      if (isSameChat || isSameGroup) {
        setMessages(prevMessages => {
          const incoming = data.message as any;
          const exists = prevMessages.some(msg => msg.id === incoming.id);
          // 类型归一
          const convertedMessage: ChatMessage = {
            ...incoming,
            messageType: incoming.messageType === 'audio' ? 'voice' :
                        incoming.messageType === 'image' ? 'photo' :
                        incoming.messageType === 'file' ? 'document' :
                        incoming.messageType as ChatMessage['messageType']
          } as any;

          // 按 fileHash 合并替换临时消息
          const fh = (convertedMessage as any)?.fileHash as string | undefined;
          if (fh) {
            const tempIdx = prevMessages.findIndex(m => m.isOwn && (m as any)?.fileHash === fh && (m.status === 'sent' || m.status === 'delivered'));
            if (tempIdx >= 0) {
              const updated = [...prevMessages];
              const prev = updated[tempIdx];
              const merged: ChatMessage = {
                ...prev,
                ...convertedMessage,
                isOwn: prev.isOwn,
              } as any;
              updated[tempIdx] = merged;
              console.log('[DEDUP:mergeByHash] replaced temp with real', { fileHash: fh, tempId: prev.id, realId: convertedMessage.id });
              return updated.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            }
          }

          if (!exists) {
            console.log('📨 [WebSocket] 添加新消息到当前聊天:', convertedMessage);
            return [...prevMessages, convertedMessage].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          }
          return prevMessages;
        });
      }
    };

    // 只监听 WebSocket 客户端的回调，避免重复处理
    websocketClient.onNewMessage(handleNewMessage);

    return () => {
      websocketClient.offNewMessage(handleNewMessage);
    };
  }, [selectedChat])


  const getPlatformIcon = (platform: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClasses = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5'
    }

    if (platform === "whatsapp") {
      return (
        <img 
          src="/logos/WhatsApp.png" 
          alt="WhatsApp" 
          className={`${sizeClasses[size]} object-contain`}
        />
      )
    }
    return (
      <img 
        src="/logos/Telegram.png" 
        alt="Telegram" 
        className={`${sizeClasses[size]} object-contain`}
      />
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500"
      case "away":
        return "bg-yellow-500"
      case "offline":
        return "bg-gray-400"
      default:
        return "bg-gray-400"
    }
  }

  // 格式化时间显示
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return t("time.just_now")
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t("time.minutes_ago")}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t("time.hours_ago")}`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} ${t("time.days_ago")}`

    return new Date(timestamp).toLocaleDateString()
  }

  // 获取聊天类型文本
  const getChatTypeText = (type: string, platform: string) => {
    if (platform === "whatsapp") {
      switch (type) {
        case "private": return t("chat.private_chat")
        case "group": return t("chat.group_chat")
        case "system": return t("chat.system")
        default: return t("chat.private_chat")
      }
    } else {
      switch (type) {
        case "private": return t("chat.private_chat")
        case "group": return t("chat.group_chat")
        case "channel": return t("chat.channel")
        case "bot": return t("chat.bot")
        case "topic": return t("chat.topic")
        case "system": return t("chat.system")
        default: return t("chat.private_chat")
      }
    }
  }

  return (
    <div className="relative h-full w-full">
    <div className="absolute inset-0 flex overflow-hidden bg-background">

      {/* 对话列表 */}
      <div className="w-[30vw] flex flex-col border-r h-full bg-background">
        <div className="p-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <SidebarTrigger />
            <h2 className="text-lg font-semibold">{t("chat.all_chats_title")}</h2>
          </div>
          
          {/* 数据源切换开关移除：默认使用真实数据 */}
          
          {/* Platform Filter - 改进的平台选择UI */}
          {/* <div className="px-4 py-3 border-b">
            <div className="space-y-3">
              <span className="text-sm font-medium text-muted-foreground">平台筛选</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPlatformFilter("all")}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] w-full ${
                    platformFilter === "all" 
                      ? "bg-black text-white shadow-sm" 
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <MessageSquare className={`h-4 w-4 flex-shrink-0 ${platformFilter === "all" ? "text-white" : "text-muted-foreground"}`} />
                  <span className="whitespace-nowrap">全部</span>
                </button>
                <button
                  onClick={() => setPlatformFilter("whatsapp")}
                  className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] w-full ${
                    platformFilter === "whatsapp" 
                      ? "bg-black text-white shadow-sm" 
                      : "bg-muted/50 text-muted-foreground hover:bg-green-50 hover:text-green-700"
                  }`}
                >
                  <img
                    src="/logos/WhatsApp.svg"
                    alt="WhatsApp"
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <span className="whitespace-nowrap text-xs">WhatsApp</span>
                </button>
                <button
                  onClick={() => setPlatformFilter("telegram")}
                  className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] w-full ${
                    platformFilter === "telegram" 
                      ? "bg-black text-white shadow-sm" 
                      : "bg-muted/50 text-muted-foreground hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <img
                    src="/logos/Telegram.svg"
                    alt="Telegram"
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <span className="whitespace-nowrap text-xs">Telegram</span>
                </button>
              </div>
            </div>
          </div> */}
            
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("chat.search_conversations")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-b flex-shrink-0">
          {/* Account Filter */}
          <div className="relative w-full" ref={accountFilterRef}>
              <Button
                variant={accountFilterDropdownOpen ? 'default' : 'outline'}
                onClick={() => setAccountFilterDropdownOpen(v => !v)}
                className="flex items-center gap-2 w-full"
              >
                {t("filter.account_filter")}
                {!accountFilterDropdownOpen && (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              {accountFilterDropdownOpen && (
                <div className="absolute z-50 mt-2 flex bg-background border rounded-md shadow-md">
                  {/* 左侧工作空间标签 */}
                  <div className="min-w-[15vw] basis-[15vw] shrink-0 border-r">
                    {workspacesForFilter.map(ws => (
                      <button
                        key={ws.key}
                        className={`w-full text-left px-3 py-2 text-xs ${accountFilterTabKey === ws.key ? 'bg-muted' : ''}`}
                        onClick={() => setAccountFilterTabKey(ws.key)}
                      >
                        {ws.label}
                      </button>
                    ))}
                  </div>
                  {/* 右侧品牌列表 */}
                  <div className="min-w-[15vw] basis-[15vw] shrink-0 max-h-72 overflow-y-auto p-3">
                    <div className="mb-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={getSelectedBrands().length === getCurrentBrands().length && getCurrentBrands().length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedBrands(getCurrentBrands())
                            else setSelectedBrands([])
                          }}
                        />
                        {t("filter.select_all")}
                      </label>
                    </div>
                    {getCurrentBrands().map(opt => (
                      <label key={opt} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={getSelectedBrands().includes(opt)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedBrands([...getSelectedBrands(), opt])
                            else setSelectedBrands(getSelectedBrands().filter(x => x !== opt))
                          }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
        {(() => {

          // const filteredChats = chats.filter(chat => {
          //   // 搜索筛选
          //   const matchesSearch = searchTerm === "" ||
          //     chat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          //     (chat.lastMessage && chat.lastMessage.toLowerCase().includes(searchTerm.toLowerCase()))

          //   // 平台筛选
          //   const matchesPlatform = platformFilter === "all" || chat.platform === platformFilter

          //   // 账户筛选
          //   const matchesAccount = accountFilter.length === 0 || accountFilter.includes(chat.accountId)

          //   // 确保聊天对应的账号是活跃的
          //   const account = accounts.find(acc => acc.id === chat.accountId)
          //   const isAccountActive = account && account.isActive


          //   return matchesSearch && matchesPlatform && matchesAccount && isAccountActive
          // })

          const filteredChats = React.useMemo(() => {
            // 1️⃣ Compute list of allowed accountIds
            const allowedAccountIds = filteredAccounts.map(acc => acc.id);
          
            // 2️⃣ Filter chats
            return chats.filter(chat => {
              // Search filter
              const matchesSearch =
                searchTerm === "" ||
                chat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (chat.lastMessage && chat.lastMessage.toLowerCase().includes(searchTerm.toLowerCase()));
          
              // Platform filter
              const matchesPlatform =
                platformFilter === "all" || chat.platform === platformFilter;
          
              // Account linkage (must belong to a filtered account)
              const matchesAccount = allowedAccountIds.includes(chat.accountId);
          
              return matchesSearch && matchesPlatform && matchesAccount;
            });
          }, [chats, filteredAccounts, searchTerm, platformFilter]);
          

          

          const organizedChats = organizeChats(filteredChats)

          return organizedChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-sm mb-1">{t("chat.no_matching_chats")}</div>
              <div className="text-xs">{t("chat.adjust_filters")}</div>
            </div>
          ) : (
            organizedChats.map((item) => {
              if ('type' in item && item.type === 'group') {
                // 群组聊天
                const { groupId, chats: groupChats } = item as { type: 'group', groupId: string, chats: ChatInfo[] }

                // 安全检查：确保 groupChats 不为空
                if (!groupChats || groupChats.length === 0) {
                  return null
                }

                const isExpanded = expandedGroups.has(groupId)
                const currentAccountId = selectedGroupAccount[groupId] || groupChats[0]?.accountId || ''
                const currentChat = groupChats.find((c: ChatInfo) => c.accountId === currentAccountId) || groupChats[0]

                return (
                  <div key={`group-${groupId}`} className="border-b">
                    {/* 群组头部 */}
                    <div
                      className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleGroupToggle(groupId)}
                    >
                      <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-12 w-12">
                            <AvatarImage src={resolveImageUrl(currentChat.avatar)} />
                            <AvatarFallback>{currentChat.name[0]}</AvatarFallback>
                  </Avatar>
                          {isExpanded && (
                            <div className="absolute -bottom-1 -left-1 w-5 h-5 bg-muted rounded-full flex items-center justify-center border-2 border-background">
                              {getPlatformIcon(currentChat.platform, 'sm')}
                  </div>
                          )}
                </div>

                                    <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-sm truncate">{currentChat.name}</h3>
                              {isExpanded && (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full text-xs">
                                  {getPlatformIcon(currentChat.platform, 'sm')}
                                  <span className="text-primary font-medium">
                                    {accounts.find((acc: AccountInfo) => acc.id === currentAccountId)?.displayName || currentAccountId}
                                  </span>
                        </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {currentChat.lastMessageTime ? formatTime(currentChat.lastMessageTime) : ''}
                          </span>
                              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      

                          <p className="text-sm text-muted-foreground truncate">
                            {currentChat.lastMessage || t("chat.no_messages_yet")}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 展开的账号列表 */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t">
                        {groupChats.map((chat: ChatInfo) => {
                          const isSelected = selectedChat?.id === chat.id
                          const isCurrentSending = chat.accountId === currentAccountId

                          return (
                            <div
                              key={chat.id}
                              className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors border-l-2 ${isSelected ? "bg-muted border-l-primary" : "border-l-transparent"
                                } ${isCurrentSending ? "bg-primary/5" : ""}`}
                              onClick={() => {
                                // 切换群组内的发送账号
                                handleGroupAccountSwitch(groupId, chat.accountId)
                                // 同时选择这个聊天
                                handleChatSelect(chat)
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <AvatarWithFallback
                                    src={resolveImageUrl(chat.avatar)}
                                    name={maskChatName(chat.name)}
                                    className="h-8 w-8 rounded-full"
                                  />
                                  <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-muted rounded-full flex items-center justify-center border-2 border-background">
                                    {getPlatformIcon(chat.platform, 'sm')}
                                  </div>
                                  {isCurrentSending && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                      <CheckCircle className="h-2 w-2 text-primary-foreground" />
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{maskChatName(chat.name)}</span>
                                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs">
                                        {getPlatformIcon(chat.platform, 'sm')}
                                        <span className="text-muted-foreground">
                                          {chat.platform === "whatsapp" ? "WA" : "TG"}
                          </span>
                                      </div>
                                      {/* {isCurrentSending && (
                                          <Badge variant="default" className="text-xs">
                                            {t("chat.sending")}
                                          </Badge>
                                        )} */}
                                    </div>
                                  </div>

                                  <p className="text-xs text-muted-foreground truncate">
                                    {chat.lastMessage || t("chat.no_messages_yet")}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              } else {
                // 普通聊天
                const chat = item as ChatInfo
                return (
                  <div
                    key={chat.id}
                    className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${selectedChat?.id === chat.id ? "bg-muted" : ""
                      }`}
                    onClick={() => handleChatSelect(chat)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <AvatarWithFallback
                          src={resolveImageUrl(chat.avatar)}
                          name={maskChatName(chat.name)}
                          className="h-12 w-12 rounded-full"
                        />
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 bg-muted rounded-full flex items-center justify-center border-2 border-background">
                          {getPlatformIcon(chat.platform, 'sm')}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-sm truncate">{maskChatName(chat.name)}</h3>
                          <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                              {chat.lastMessageTime ? formatTime(chat.lastMessageTime) : ''}
                          </span>
                          </div>
                      </div>
                      

                      <p className="text-sm text-muted-foreground truncate">
                          {chat.lastMessage || t("chat.no_messages_yet")}
                        </p>
                    </div>
              </div>
            </div>
                )
              }
            })
          )
        })()}
        </div>
      </div>

      {/* 聊天区域 */}
    <div className="flex-1 flex flex-col h-full bg-background">
        {/* 聊天头部 - 固定在顶部 */}
      <div className="flex-shrink-0 border-b p-3 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedChat?.avatar || "/placeholder.svg"} />
                <AvatarFallback>{maskChatName(selectedChat?.name || 'U')[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div>
            <h3 className="font-medium">{selectedChat ? maskChatName(selectedChat.name) : t("chat.select_chat")}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Video className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
              <DropdownMenuItem>{t("chat.view_details_menu")}</DropdownMenuItem>
              <DropdownMenuItem>{t("chat.mute_notifications")}</DropdownMenuItem>
              <DropdownMenuItem>{t("chat.clear_chat")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* 消息列表 - 可滚动区域 */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 bg-background">
      {isMessagesLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
          {t("chat.loading_messages")}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {selectedChat ? t("chat.no_messages") : t("chat.select_chat")}
            </div>
          ) : (
        <div className="space-y-4">
          {/* 消息列表 */}
          {messages.map((message, index) => {
            const isConsecutive = index > 0 &&
              messages[index - 1].sender === message.sender &&
              (message.timestamp - messages[index - 1].timestamp) < 300000; // 5分钟内

            return (
              <div key={message.id} 
              className={`flex ${
                message.messageType === "system"
                  ? "justify-center"
                  : message.isOwn
                    ? "justify-end"
                    : "justify-start"
                }`}>

                {message.messageType === "system" ? (
                  <div className="text-xs text-muted-foreground italic bg-muted/40 px-3 py-1 rounded-lg text-center my-2 max-w-[80%]">
                    {message.content}
                  </div>
                ) : (
                <div className={`max-w-[75%] ${message.isOwn ? "order-2" : "order-1"}`}>
                  {/* 发送者信息（非连续消息时显示） */}
                  {!isConsecutive && (
                    <div className={`flex items-center gap-2 mb-1 ${message.isOwn ? "justify-end" : "justify-start"}`}>
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {maskChatName(message.senderName || message.sender || 'U')[0] || 'U'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {maskChatName(message.senderName || message.sender || '未知用户')}
                        </span>
                        {/* 群组消息显示发送账号 */}
                        {selectedChat?.type === 'group' && selectedChat.accountId && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-muted/50 rounded text-xs">
                            {getPlatformIcon(selectedChat.platform, 'sm')}
                            <span className="text-muted-foreground">
                              {accounts.find((acc: AccountInfo) => acc.id === selectedChat.accountId)?.displayName || selectedChat.accountId}
                            </span>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {typeof message.timestamp === 'number' ? formatTime(message.timestamp) : message.timestamp}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 消息气泡 */}
                  <div className={`p-3 rounded-lg ${
                    message.isOwn 
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                    } ${isConsecutive ? "mt-1" : ""}`}>
                    {/* 渲染前调试日志 */}
                    {(() => {
                      try {
                        // console.log('[render]', { id: message.id, type: message.messageType, content: message.content });
                      } catch {}
                      return null;
                    })()}
                    {/* 根据消息类型显示不同内容（带图片URL智能回退） */}
                    {(() => {
                      const contentStr = String(message.content || '');
                      const isWADocument = /\/api\/media\/wa\/.+\/(document)\//.test(contentStr);
                      const isWASticker = /\/api\/media\/wa\/.+\/(sticker)\//.test(contentStr);
                      const isImageUrl = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(contentStr) || /\/api\/media\/.+\/(photo)\//.test(contentStr);
                      // 限制回退：若明确是 WA 的 document 或 sticker 路径，则不要当作图片渲染
                      if ((message.messageType === 'photo' || isImageUrl) && !isWADocument && !isWASticker) {
                        if (message.messageType !== 'photo' && isImageUrl) {
                          try { console.warn('[render][fallback-photo] 非photo类型但检测到图片URL，按图片渲染:', { id: message.id, content: message.content }); } catch {}
                        }
                        return (
                      <div className="space-y-2">
                        <div className="image-container group">
                          <img
                            src={resolveMediaUrl(validateSrc(message.content))}
                            alt={t('common.photo')}
                            className="cursor-pointer"
                            style={{
                              width: '100%',
                              height: 'auto',
                              maxHeight: '400px',
                              minHeight: '120px',
                              objectFit: 'contain',
                              objectPosition: 'center',
                              display: 'block',
                              transition: 'opacity 0.3s ease-in-out'
                            }}
                            onLoad={(e) => {
                              console.log('✅ [图片加载] 图片加载成功:', {
                                messageId: message.id,
                                realSrc: message.content,
                                imgElement: e.currentTarget
                              });
                            }}
                          />
                        </div>
                      </div>
                        );
                      }
                      return null;
                    })()}
                    {message.messageType === 'video' ? (
                      <div className="space-y-2">
                        <VideoPlayer src={validateSrc(message.content)} />
      </div>
                    ) : message.messageType === 'document' ? (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <FileText className="h-4 w-4" />
                        {(() => {
                          const raw = String(message.content || '');
                          const isUploading = /\((上传中|转换中|发送中)\.\.\.\)/.test(raw);
                          const docUrl = resolveMediaUrl(validateSrc(raw));
                          // console.log('[DEDUP:renderDoc]', {
                          //   id: message.id,
                          //   type: message.messageType,
                          //   fileHash: (message as any)?.fileHash,
                          //   fileName: (message as any)?.fileName,
                          //   docUrl
                          // });
                          const hintedName = (message as any)?.fileName as string | undefined;
                          const fileHash = (message as any)?.fileHash as string | undefined;
                          if (fileHash) {
                            const seen = seenFileHashesRef.current.has(fileHash);
                            if (!seen) {
                              seenFileHashesRef.current.add(fileHash);
                              console.log(`[DEDUP] document fileHash=${fileHash} MISS`);
                            } else {
                              console.log(`[DEDUP] document fileHash=${fileHash} HIT`);
                            }
                          }
                          // 懒取文件名（从响应头）
                          try {
                            if (!hintedName) {
                              // 不在这里渲染 displayName，先挂载获取器再在下方统一渲染
                              return (
                                  <DocumentNameFetcher messageId={message.id} docUrl={docUrl} hintedName={hintedName} />
                              );
                            }
                          } catch {}
                          const urlFilePart = (() => { try { const u = new URL(docUrl); return u.pathname.split('/').pop() || ''; } catch { return docUrl.split('/').pop() || ''; } })();
                          const displayName = (hintedName && hintedName.trim())
                            ? hintedName.trim()
                            : (decodeURIComponent(urlFilePart || '').replace(/\+/g, ' ') || `[${t('common.document')}]`);
                          return (
                            <>
                              <span className="text-sm flex-1 truncate" title={displayName}>
                                {displayName}
                              </span>
                              <button
                                onClick={() => handleDownload(docUrl, displayName)}
                                className="text-xs text-blue-500 hover:underline flex-shrink-0 bg-transparent border-none cursor-pointer"
                                disabled={isUploading || downloadingStates[message.id] || !docUrl.startsWith('http') && !docUrl.startsWith('/api/media/')}
                              >
                                {isUploading ? '准备中...' : (downloadingStates[message.id] ? '下载中...' : '下载')}
                              </button>
                            </>
                          );
                        })()}
          </div>
                    ) : message.messageType === 'sticker' ? (
                      <StickerWrapper
                        src={validateSrc(message.content)}
                        messageId={message.id}
                        type={isTGSFile(message.content) ? 'tgs' : 'webp'}
                        className="max-w-32 h-auto max-h-32"
                        onLoad={() => {
                          console.log('🎭 贴纸渲染成功:', message.content);
                        }}
                        onError={(error) => {
                          console.error('❌ 贴纸渲染失败:', message.content, error);
                        }}
                      />
                    ) : message.messageType === 'voice' ? (
                      <VoiceMessageComponent 
                        message={message}
                        content={message.content}
                        messageId={message.id}
                        isOwn={message.isOwn}
                      />
                    ) : message.messageType === 'location' ? (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">[位置]</span>
        </div>
                    ) : (
                      <div className="space-y-2">
                        {/* 智能检测：如果 content 包含媒体标识符，尝试显示为对应类型 */}
                        {message.content.includes('[image]') ? (
                          <div className="space-y-2">
                            <div className="image-container group">
                              <img
                                src={resolveMediaUrl(validateSrc(message.content.replace('[image]', '').trim()))}
                                alt={t('common.photo')}
                                className="cursor-pointer"
                                style={{
                                  width: '100%',
                                  height: 'auto',
                                  maxHeight: '400px',
                                  minHeight: '120px',
                                  objectFit: 'contain',
                                  objectPosition: 'center',
                                  display: 'block',
                                  transition: 'opacity 0.3s ease-in-out'
                                }}
                                onLoad={() => {
                                  console.log('✅ [智能检测图片] 图片加载成功:', message.content);
                                }}
                              />
              </div>
              </div>
                        ) : message.content.includes('[video]') ? (
                          <div className="space-y-2">
                            <VideoPlayer src={validateSrc(message.content.replace('[video]', '').trim())} />
            </div>
                        ) : message.content.includes('[audio]') || message.content.includes('[voice]') ? (
                          <VoiceMessageComponent 
                            message={message}
                            content={message.content.replace(/\[(audio|voice)\]/g, '').trim()}
                            messageId={message.id}
                            isOwn={message.isOwn}
                          />
                        ) : message.content.includes('[document]') ? (
                          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm flex-1 truncate" title={message.content}>
                              {message.content.replace('[document]', '').trim()}
                            </span>
                            <button
                              onClick={() => handleDownload(message.content.replace('[document]', '').trim())}
                              className="text-xs text-blue-500 hover:underline flex-shrink-0 bg-transparent border-none cursor-pointer"
                            >
                              下载
                            </button>
          </div>
                        ) : message.content.includes('[sticker]') ? (
                          <div className="space-y-2">
                            <StickerWrapper
                              src={validateSrc(message.content.replace('[sticker]', '').trim())}
                              messageId={message.id}
                              type={isTGSFile(message.content) ? 'tgs' : 'webp'}
                              className="max-w-32 h-auto max-h-32"
                            />
            </div>
                        ) : (
                          // 默认文本：如果已作为图片渲染（messageType 为 photo 或内容是图片URL），则不要再显示原始URL文本
                          !((() => {
                            const contentStr = String(message.content || '');
                            const isImageUrl = /(\.(jpg|jpeg|png|gif|webp)(\?.*)?$)/i.test(contentStr) || /\/api\/media\/.+\/(photo)\//.test(contentStr);
                            return message.messageType === 'photo' || isImageUrl;
                          })()) && (
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {/* 消息状态和时间（仅自己的消息显示） */}
                  {message.isOwn && (
                    <div className="flex items-center gap-1 mt-1 justify-end">
                      <span className="text-xs text-muted-foreground">
                        {typeof message.timestamp === 'number' ? formatTime(message.timestamp) : message.timestamp}
                      </span>
                      <CheckCircle2
                        className={`h-3 w-3 ${message.status === "read"
                            ? "text-blue-500"
                            : message.status === "delivered"
                              ? "text-green-500"
                              : "text-muted-foreground"
                          }`}
                      />
              </div>
                  )}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}
  </div>

    <div className="flex-shrink-0 border-t p-3 bg-background">
      <div className="flex items-center gap-2">
        {/* 文件上传按钮 */}
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            disabled={!selectedChat}
            onClick={() => setShowFileDropdown(!showFileDropdown)}
            className="h-10 w-10"
            title="上传文件"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </Button>
          
          {/* 文件类型下拉菜单 */}
          {showFileDropdown && (
            <div className="absolute bottom-12 left-0 bg-background border rounded-lg shadow-lg p-1 z-50 min-w-40">
              <button
                onClick={() => handleFileTypeSelect('document')}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('attachment.document')}
              </button>
              <button
                onClick={() => handleFileTypeSelect('photo')}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t('attachment.photo_video')}
              </button>
          </div>
          )}
        </div>

        {/* 语音录制按钮 */}
        <Button
          variant="outline"
          size="icon"
          disabled={!selectedChat}
          onClick={handleVoiceRecord}
          className={`h-10 w-10 ${isRecording ? 'bg-red-500 text-white' : ''}`}
          title={isRecording ? t('voice.stop_recording') : t('voice.record_voice')}
        >
          {isRecording ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
            </svg>
          )}
          </Button>

        {/* Emoji 按钮 */}
        <Button
          variant="outline"
          size="icon"
          disabled={!selectedChat}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="h-10 w-10"
          title="选择表情"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            <circle cx="8.5" cy="9.5" r="1.5"/>
            <circle cx="15.5" cy="9.5" r="1.5"/>
            <path d="M12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
          </svg>
          </Button>

        {/* 语音录制界面 */}  
        {recordedAudio ? (
          <div className="flex-1 flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-red-700 dark:text-red-300">
                🎤 {t('voice.recording_completed')} ({Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')})
              </span>
        </div>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteRecording}
                className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-300"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t('voice.delete')}
              </Button>
              <Button
                size="sm"
                onClick={handleSendRecording}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {t('voice.send')}
              </Button>
      </div>
          </div>
        ) : isRecording ? (
          <div className="flex-1 flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-red-700 dark:text-red-300">
                🎤 {t('voice.recording')} ({Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')})
              </span>
              
              {/* 音波可视化 */}
              <div className="flex items-center gap-1 ml-4">
                {Array.from({ length: 8 }, (_, i) => {
                  const height = Math.max(4, (audioLevel / 255) * 20 + Math.random() * 10);
                  const delay = i * 0.1;
                  return (
                    <div
                      key={i}
                      className="bg-red-500 rounded-full transition-all duration-150"
                      style={{
                        width: '3px',
                        height: `${height}px`,
                        animationDelay: `${delay}s`,
                        animation: 'wave 0.5s ease-in-out infinite alternate'
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVoiceRecord}
              className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-300"
            >
              {t('voice.stop_recording')}
            </Button>
          </div>
        ) : (
          <>
        <Input
              placeholder={selectedChat ? t("chat.input_message") : t("chat.select_chat")} 
          className="flex-1"
          disabled={!selectedChat}
          value={pendingMessage}
          onChange={(e) => setPendingMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
        />
        <Button
          disabled={!selectedChat || !pendingMessage.trim()}
          onClick={handleSendMessage}
        >
          {t("chat.send_message")}
        </Button>
          </>
        )}
      </div>
      
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      </div>

    {/* Emoji 选择器面板 */}
    {showEmojiPicker && (
      <div className="absolute bottom-20 left-80 right-4 bg-background border rounded-lg shadow-lg p-2 z-50 w-64">
        <div className="grid grid-cols-6 gap-1">
          {[
            '😀', '😃', '😄', '😁', '😆', '😅',
            '🙂', '🙃', '😉', '😊', '😇', '🥰',
            '😘', '😗', '😚', '😙', '😋', '😛',
            '😐', '😑', '😶', '😏', '😒', '🙄',
            '😔', '😕', '🙁', '☹️', '😣', '😖',
            '😢', '😭', '😤', '😠', '😡', '🤬',
            '👍', '👎', '👌', '✌️', '🤞', '🤟',
            '❤️', '🧡', '💛', '💚', '💙', '💜',
            '💔', '❣️', '💕', '💞', '💓', '💗',
            '❌', '⭕', '❗', '❓', '✅', '❎'
          ].map((emoji, index) => (
            <button
              key={index}
              onClick={() => handleEmojiSelect(emoji)}
              className="text-lg hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1 transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
  </div >
    
    {/* WebSocket状态指示器 */}
    <WebSocketIndicator 
      showDetails={false}
      position="bottom-right"
    />
    </div>
  )
}
