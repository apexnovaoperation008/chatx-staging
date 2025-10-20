/**
 * 简化版聊天数据获取服务
 * 临时解决TypeScript类型错误问题
 */

import { ChatInfo, ChatMessage, ChatMessagesResponse, ChatListResponse, MessageProvider } from "../types/chat.types";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";
import { getReconnectedWaClient, getReconnectedTgClient } from "./startup-reconnect.service";
import { accountDatabaseService } from "@/database/account.database.service";
import { Api } from "telegram";

// 缓存接口
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // 生存时间（毫秒）
}

// 缓存存储
const dialogsCache = new Map<string, CacheItem<any[]>>();

// 缓存配置
const CACHE_TTL = 3000; // 3秒过期

// 缓存工具函数
function getCachedDialogs(accountId: string): any[] | null {
  const cached = dialogsCache.get(accountId);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > cached.ttl) {
    // 缓存过期
    dialogsCache.delete(accountId);
    console.log(`🗑️ [缓存] ${accountId} 的对话缓存已过期`);
    return null;
  }

  console.log(`💾 [缓存] 使用 ${accountId} 的对话缓存`);
  return cached.data;
}

function setCachedDialogs(accountId: string, dialogs: any[]): void {
  dialogsCache.set(accountId, {
    data: dialogs,
    timestamp: Date.now(),
    ttl: CACHE_TTL
  });
  console.log(`💾 [缓存] 缓存 ${accountId} 的 ${dialogs.length} 个对话，TTL: ${CACHE_TTL}ms`);
}

// 下载Telegram头像
async function downloadTelegramAvatar(client: any, entity: any): Promise<string | null> {
  try {
    // 使用downloadProfilePhoto方法下载头像
    const avatarBuffer = await client.downloadProfilePhoto(entity, { isBig: true });

    if (avatarBuffer && avatarBuffer.length > 0) {
      // 将buffer转换为base64 data URL
      const base64 = avatarBuffer.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    }

    return null;
  } catch (error) {
    console.log(`⚠️ [头像下载] 下载失败:`, error);
    return null;
  }
}

/**
 * 获取所有聊天列表（简化版）
 */
// export async function getChatWithMessages(): Promise<ChatListResponse> {
//   try {
//     console.log("🔍 [完整版] 获取所有聊天列表...");
//     console.log("📱 [完整版] 使用 whatsappProvider 获取WhatsApp聊天");
//     console.log("📱 [完整版] 使用 telegramProvider 获取Telegram聊天");
//     const waProvider = getProvider('whatsapp');
//     const tgProvider = getProvider('telegram');
//     // 🚀 并行获取WhatsApp和Telegram聊天数据
//     // 使用完整版获取更详细的信息
//     const waAccounts = WhatsAppSessionsStore.list().map(session => session.id);
//     const tgAccounts = TelegramSessionsStore.list().map(session => session.id);

//     console.log(`📱 [完整版] WhatsApp账号数量: ${waAccounts.length}`);
//     console.log(`📱 [完整版] Telegram账号数量: ${tgAccounts.length}`);

//     const [whatsappChats, telegramChats] = await Promise.all([
//       Promise.all(waAccounts.map(accountId => waProvider.getChats(accountId))).then(res => res.flat()),
//       Promise.all(tgAccounts.map(accountId => tgProvider.getChats(accountId))).then(res => res.flat())    
//     ]);

//     console.log(`✅ [完整版] WhatsApp聊天数量: ${whatsappChats.length}`);
//     console.log(`✅ [完整版] Telegram聊天数量: ${telegramChats.length}`);

//     const allChats = [...whatsappChats, ...telegramChats];

//     // 按最后消息时间排序
//     allChats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

//     console.log(`📋 [简化版] 获取到 ${allChats.length} 个聊天 (${whatsappChats.length} WhatsApp + ${telegramChats.length} Telegram)`);

//     return {
//       chats: allChats,
//       totalCount: allChats.length,
//       hasMore: false
//     };
//   } catch (error) {
//     console.error("❌ [简化版] 获取聊天列表失败:", error);
//     return {
//       chats: [],
//       totalCount: 0,
//       hasMore: false
//     };
//   }
// }


export class ChatService {
  constructor(
    private waProvider: MessageProvider,
    private tgProvider: MessageProvider
  ) { }

  // 获取对应平台的provider
  getProvider(platform: string): MessageProvider | undefined {
    switch (platform) {
      case 'wa':
      case 'whatsapp':
        return this.waProvider;
      case 'tg':
      case 'telegram':
        return this.tgProvider;
      default:
        return undefined;
    }
  }

  async getChatWithMessages(workspaceIds: number[], userId:number): Promise<ChatListResponse> {
    try {
      //const accounts = await accountDatabaseService.findByWorkspaceId(workspaceId);

    
    //   const waAccounts = WhatsAppSessionsStore
    //   .list()
    //   .filter(acc => {
    //     const data = acc.data as any;
    //     const wsId = data?.workspace_id ?? data?.workspaceId;
    //     return data?.isActive !== false && workspaceIds.includes(wsId);
    //   })
    //   .map(acc => acc.id);

    // const tgAccounts = TelegramSessionsStore
    //   .list()
    //   .filter(acc => {
    //     const data = acc.data as any;
    //     const wsId = data?.workspace_id ?? data?.workspaceId;
    //     return data?.isActive !== false && workspaceIds.includes(wsId);
    //   })
    //   .map(acc => acc.id);

    const waAccounts = WhatsAppSessionsStore
      .list()
      .filter(acc => {
        const data = acc.data as any;
        const wsId = Number(data?.workspace_id ?? data?.workspaceId ?? 0);
        const isActive = data?.isActive !== false;
        
        if (!isActive) return false;
        
        // Include if workspace is in user's workspaces
        if (wsId !== 0 && workspaceIds.includes(wsId)) {
          return true;
        }
        
        // Include if personal account (workspace=0) created by current user
        if (wsId === 0 && acc.createdBy === userId) {
          return true;
        }
        
        return false;
      })
      .map(acc => acc.id);

    const tgAccounts = TelegramSessionsStore
      .list()
      .filter(acc => {
        const data = acc.data as any;
        const wsId = Number(data?.workspace_id ?? data?.workspaceId ?? 0);
        const isActive = data?.isActive !== false;
        
        if (!isActive) return false;
        
        // Include if workspace is in user's workspaces
        if (wsId !== 0 && workspaceIds.includes(wsId)) {
          return true;
        }
        
        // Include if personal account (workspace=0) created by current user
        if (wsId === 0 && acc.createdBy === userId) {
          return true;
        }
        
        return false;
      })
      .map(acc => acc.id);


      // WhatsApp 聊天
      let whatsappChats: ChatInfo[] = [];
      let telegramChats: ChatInfo[] = [];
      try {
        [whatsappChats, telegramChats] = await Promise.all([
          Promise.all(waAccounts.map(accountId => this.waProvider.getChats(accountId))).then(res => res.flat()),
          Promise.all(tgAccounts.map(accountId => this.tgProvider.getChats(accountId))).then(res => res.flat()),
        ]);
      } catch (err: any) {
        console.warn("[WARN] WhatsApp/Telegram 获取聊天失败:", err.message);
      }

      const allChats = [...whatsappChats, ...telegramChats];
      console.log(`📊 [后端] WhatsApp: ${whatsappChats.length}, Telegram: ${telegramChats.length}, 总计: ${allChats.length}`);
      allChats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

      return {
        chats: allChats,
        totalCount: allChats.length,
        hasMore: false,
      };
    } catch (error) {
      console.error("❌ [ChatService] 获取聊天列表失败:", error);
      return { chats: [], totalCount: 0, hasMore: false };
    }
  }
}
// /**
//  * 获取WhatsApp聊天列表（简化版）
//  */
// async function getWhatsAppChatsSimple(): Promise<ChatInfo[]> {
//   try {
//     const whatsappAccounts = WhatsAppSessionsStore.list();
//     console.log(`📱 [简化版] 找到 ${whatsappAccounts.length} 个WhatsApp账号`);

//     // 🚀 并行处理所有WhatsApp账号
//     const accountChatPromises = whatsappAccounts.map(async (account) => {
//       try {
//         console.log(`📱 [简化版] 处理WhatsApp账号: ${account.id}`);

//         // 检查账号是否启用
//         const isActive = (account.data as any)?.isActive !== false;
//         if (!isActive) {
//           console.log(`⚠️ [简化版] WhatsApp账号已禁用: ${account.id}`);
//           return [];
//         }

//         // 获取客户端
//         const client = getReconnectedWaClient(account.id);
//         if (!client) {
//           console.log(`⚠️ [简化版] WhatsApp客户端未找到: ${account.id}`);
//           return [];
//         }

//         // 验证连接
//         const isConnected = await client.isConnected();
//         if (!isConnected) {
//           console.log(`⚠️ [简化版] WhatsApp客户端未连接: ${account.id}`);
//           return [];
//         }

//         // 获取聊天列表
//         const chats = await client.getAllChats();
//         console.log(`📋 [简化版] ${account.id} 获取到 ${chats.length} 个聊天`);

//         const accountChats: ChatInfo[] = [];

//         for (let i = 0; i < Math.min(chats.length, 50); i++) { // 限制数量避免性能问题
//           const chat = chats[i];

//           try {
//             const originalChatId = (chat as any).id?._serialized || `chat-${i}`;
//             const chatName = (chat as any).name || 
//                            (chat as any).contact?.pushname || 
//                            originalChatId.split('@')[0] || 
//                            '未知联系人';

//             const chatInfo: ChatInfo = {
//               id: `wa-${account.id}-${originalChatId}`,
//               platform: 'whatsapp',
//               accountId: account.id,
//               name: chatName,
//               avatar: '', // 暂时跳过头像，避免类型错误
//               type: (chat as any).isGroup ? 'group' : 'private',
//               phoneNumber: (chat as any).isGroup ? undefined : originalChatId.split('@')[0],
//               unreadCount: (chat as any).unreadCount || 0,
//               status: 'offline',
//               createdAt: Date.now(),
//               updatedAt: Date.now()
//             };

//             accountChats.push(chatInfo);
//           } catch (chatError) {
//             console.log(`⚠️ [简化版] 处理聊天失败: ${account.id}`, chatError);
//           }
//         }

//         return accountChats;

//       } catch (accountError) {
//         console.error(`❌ [简化版] WhatsApp账号处理失败: ${account.id}`, accountError);
//         return [];
//       }
//     });

//     const accountChatsArrays = await Promise.all(accountChatPromises);
//     const allChats: ChatInfo[] = [];
//     for (const accountChats of accountChatsArrays) {
//       allChats.push(...accountChats);
//     }

//     return allChats;
//   } catch (error) {
//     console.error("❌ [简化版] 获取WhatsApp聊天失败:", error);
//     return [];
//   }
// }

/**
 * 获取WhatsApp聊天列表（完整版）
 * 包含更详细的聊天信息，如头像、最后消息、成员信息等
 */
async function getWhatsAppChatsComplete(): Promise<ChatInfo[]> {
  try {
    console.log("🚀 [完整版] 开始执行 getWhatsAppChatsComplete() 函数");
    const whatsappAccounts = WhatsAppSessionsStore.list();
    console.log(`📱 [完整版] 找到 ${whatsappAccounts.length} 个WhatsApp账号`);

    // 🚀 并行处理所有WhatsApp账号
    const accountChatPromises = whatsappAccounts.map(async (account) => {
      try {
        console.log(`📱 [完整版] 处理WhatsApp账号: ${account.id}`);

        // 检查账号是否启用
        const isActive = (account.data as any)?.isActive !== false;
        if (!isActive) {
          console.log(`⚠️ [完整版] WhatsApp账号已禁用: ${account.id}`);
          return [];
        }

        // 获取客户端
        const client = getReconnectedWaClient(account.id);
        if (!client) {
          console.log(`⚠️ [完整版] WhatsApp客户端未找到: ${account.id}`);
          return [];
        }

        // 验证连接
        const isConnected = await client.isConnected();
        if (!isConnected) {
          console.log(`⚠️ [完整版] WhatsApp客户端未连接: ${account.id}`);
          return [];
        }

        // 获取聊天列表
        const chats = await client.getAllChats();
        console.log(`📋 [完整版] ${account.id} 获取到 ${chats.length} 个聊天`);

        const accountChats: ChatInfo[] = [];

        for (let i = 0; i < Math.min(chats.length, 100); i++) { // 增加限制到100个
          const chat = chats[i];

          try {
            const originalChatId = (chat as any).id?._serialized || `chat-${i}`;

            // 获取更详细的名称信息
            let chatName = '';
            if ((chat as any).name) {
              chatName = (chat as any).name;
            } else if ((chat as any).contact?.pushname) {
              chatName = (chat as any).contact.pushname;
            } else if ((chat as any).contact?.name) {
              chatName = (chat as any).contact.name;
            } else {
              chatName = originalChatId.split('@')[0] || '未知联系人';
            }

            // 获取头像信息
            let avatar = '';
            try {
              if ((chat as any).profilePicUrl) {
                avatar = (chat as any).profilePicUrl;
              } else if ((chat as any).contact?.profilePicUrl) {
                avatar = (chat as any).contact.profilePicUrl;
              }
            } catch (avatarError) {
              console.log(`⚠️ [完整版] 获取头像失败: ${account.id}`, avatarError);
            }

            // 获取最后消息信息
            let lastMessage = '';
            let lastMessageTime = Date.now();
            let lastMessageSender = '';

            try {
              const lastMessageObj = (chat as any).lastMessage;
              if (lastMessageObj) {
                if (lastMessageObj.body) {
                  lastMessage = lastMessageObj.body;
                } else if (lastMessageObj.type) {
                  lastMessage = `[${lastMessageObj.type}]`;
                }

                if (lastMessageObj.timestamp) {
                  lastMessageTime = lastMessageObj.timestamp * 1000;
                }

                if (lastMessageObj.sender) {
                  lastMessageSender = lastMessageObj.sender.pushname ||
                    lastMessageObj.sender.name ||
                    lastMessageObj.sender.id || '未知发送者';
                }
              }
            } catch (messageError) {
              console.log(`⚠️ [完整版] 获取最后消息失败: ${account.id}`, messageError);
            }

            // 获取成员数量（群组）
            let memberCount: number | undefined;
            if ((chat as any).isGroup) {
              try {
                const participants = (chat as any).participants;
                memberCount = participants ? participants.length : undefined;
              } catch (memberError) {
                console.log(`⚠️ [完整版] 获取成员数量失败: ${account.id}`, memberError);
              }
            }

            // 获取未读消息数
            const unreadCount = (chat as any).unreadCount || 0;

            // 确定在线状态
            let status: 'online' | 'offline' | 'away' | 'typing' = 'offline';
            if (unreadCount > 0) {
              status = 'online';
            }

            // 检查是否验证
            const isVerified = (chat as any).contact?.isVerified || false;

            // 构造稳定的 groupId（WhatsApp）
            let groupId: string | undefined
            if ((chat as any).isGroup) {
              const gidPart = originalChatId.split('@')[0]
              groupId = `whatsapp:gid:${gidPart}`
            } else {
              // 私聊：使用完整JID或提取E164
              groupId = `whatsapp:jid:${originalChatId}`
            }

            const chatInfo: ChatInfo = {
              id: `wa-${account.id}-${originalChatId}`,
              platform: 'whatsapp',
              accountId: account.id,
              groupId,
              name: chatName,
              avatar: avatar,
              type: (chat as any).isGroup ? 'group' : 'private',
              phoneNumber: (chat as any).isGroup ? undefined : originalChatId.split('@')[0],
              isVerified: isVerified,
              memberCount: memberCount,
              lastMessage: lastMessage,
              lastMessageTime: lastMessageTime,
              lastMessageSender: lastMessageSender,
              unreadCount: unreadCount,
              status: status,
              createdAt: Date.now() - 86400000, // 假设1天前创建
              updatedAt: Date.now()
            };

            accountChats.push(chatInfo);
          } catch (chatError) {
            console.log(`⚠️ [完整版] 处理聊天失败: ${account.id}`, chatError);
          }
        }

        return accountChats;

      } catch (accountError) {
        console.error(`❌ [完整版] WhatsApp账号处理失败: ${account.id}`, accountError);
        return [];
      }
    });

    const accountChatsArrays = await Promise.all(accountChatPromises);
    const allChats: ChatInfo[] = [];
    for (const accountChats of accountChatsArrays) {
      allChats.push(...accountChats);
    }

    console.log(`📋 [完整版] 总共获取到 ${allChats.length} 个WhatsApp聊天`);
    console.log("✅ [完整版] getWhatsAppChatsComplete() 函数执行完成");
    return allChats;
  } catch (error) {
    console.error("❌ [完整版] 获取WhatsApp聊天失败:", error);
    return [];
  }
}

/**
 * 获取Telegram聊天列表（简化版）
 */
// async function getTelegramChatsSimple(): Promise<ChatInfo[]> {
//   try {
//     const telegramAccounts = TelegramSessionsStore.list();
//     console.log(`📱 [简化版] 找到 ${telegramAccounts.length} 个Telegram账号`);

//     // 🚀 并行处理所有Telegram账号
//     const accountChatPromises = telegramAccounts.map(async (account) => {
//       try {
//         console.log(`📱 [简化版] 处理Telegram账号: ${account.id}`);

//         // 检查账号是否启用
//         const isActive = (account.data as any)?.isActive !== false;
//         if (!isActive) {
//           console.log(`⚠️ [简化版] Telegram账号已禁用: ${account.id}`);
//           return [];
//         }

//         // 获取客户端
//         const client = getReconnectedTgClient(account.id);
//         if (!client) {
//           console.log(`⚠️ [简化版] Telegram客户端未找到: ${account.id}`);
//           return [];
//         }

//         // 验证连接
//         const me = await client.getMe();
//         if (!me) {
//           console.log(`⚠️ [简化版] Telegram客户端未连接: ${account.id}`);
//           return [];
//         }

//         // 获取对话列表
//         const dialogs = await client.getDialogs({ limit: 50 });
//         console.log(`📋 [简化版] ${account.id} 获取到 ${dialogs.length} 个对话`);

//         const accountChats: ChatInfo[] = [];

//         for (const dialog of dialogs) {
//           try {
//             const entity = dialog.entity;
//             const message = dialog.message;

//             const originalChatId = (entity as any).id?.toString() || `dialog-${Date.now()}`;
//             const chatName = (entity as any).title || 
//                            (entity as any).firstName || 
//                            (entity as any).username || 
//                            `Telegram ${originalChatId}`;

//             let chatType: 'private' | 'group' | 'channel' | 'bot' = 'private';
//             if ((entity as any).className === 'Channel') {
//               chatType = (entity as any).broadcast ? 'channel' : 'group';
//             } else if ((entity as any).className === 'Chat') {
//               chatType = 'group';
//             } else if ((entity as any).className === 'User') {
//               chatType = (entity as any).bot ? 'bot' : 'private';
//             }

//             const chatInfo: ChatInfo = {
//               id: `tg-${account.id}-${originalChatId}`,
//               platform: 'telegram',
//               accountId: account.id,
//               name: chatName,
//               avatar: '', // 暂时跳过头像
//               type: chatType,
//               username: (entity as any).username,
//               memberCount: (entity as any).participantsCount,
//               lastMessage: (message as any)?.message || '',
//               lastMessageTime: (message as any)?.date ? (message as any).date * 1000 : Date.now(),
//               unreadCount: dialog.unreadCount || 0,
//               status: 'offline',
//               createdAt: Date.now(),
//               updatedAt: Date.now()
//             };

//             accountChats.push(chatInfo);
//           } catch (dialogError) {
//             console.log(`⚠️ [简化版] 处理Telegram对话失败: ${account.id}`, dialogError);
//           }
//         }

//         return accountChats;

//       } catch (accountError) {
//         console.error(`❌ [简化版] Telegram账号处理失败: ${account.id}`, accountError);
//         return [];
//       }
//     });

//     const accountChatsArrays = await Promise.all(accountChatPromises);
//     const allChats: ChatInfo[] = [];
//     for (const accountChats of accountChatsArrays) {
//       allChats.push(...accountChats);
//     }

//     return allChats;
//   } catch (error) {
//     console.error("❌ [简化版] 获取Telegram聊天失败:", error);
//     return [];
//   }
// }

/**
 * 获取Telegram聊天列表（完整版）
 * 包含更详细的聊天信息，如头像、最后消息、成员信息等
 */
// async function getTelegramChatsComplete(): Promise<ChatInfo[]> {
//   try {
//     console.log("🚀 [完整版] 开始执行 getTelegramChatsComplete() 函数");
//     const telegramAccounts = TelegramSessionsStore.list();
//     console.log(`📱 [完整版] 找到 ${telegramAccounts.length} 个Telegram账号`);

//     // 🚀 并行处理所有Telegram账号
//     const accountChatPromises = telegramAccounts.map(async (account) => {
//       try {
//         console.log(`📱 [完整版] 处理Telegram账号: ${account.id}`);

//         // 检查账号是否启用
//         const isActive = (account.data as any)?.isActive !== false;
//         if (!isActive) {
//           console.log(`⚠️ [完整版] Telegram账号已禁用: ${account.id}`);
//           return [];
//         }

//         // 获取客户端
//         const client = getReconnectedTgClient(account.id);
//         if (!client) {
//           console.log(`⚠️ [完整版] Telegram客户端未找到: ${account.id}`);
//           return [];
//         }

//         // 验证连接
//         const me = await client.getMe();
//         if (!me) {
//           console.log(`⚠️ [完整版] Telegram客户端未连接: ${account.id}`);
//           return [];
//         }

//         // 直接从API获取对话列表（移除缓存以确保实时性）
//         console.log(`🔄 [完整版] ${account.id} 从API获取对话`);
//         const dialogs = await client.getDialogs({ limit: 100 });
//         console.log(`📋 [完整版] ${account.id} 获取到 ${dialogs.length} 个对话`);

//         const accountChats: ChatInfo[] = [];

//         for (const dialog of dialogs) {
//           try {
//             const entity = dialog.entity;
//             const message = dialog.message;

//             const originalChatId = (entity as any).id?.toString() || `dialog-${Date.now()}`;

//             // 获取更详细的名称信息
//             let chatName = '';
//             if ((entity as any).title) {
//               chatName = (entity as any).title;
//             } else if ((entity as any).firstName && (entity as any).lastName) {
//               chatName = `${(entity as any).firstName} ${(entity as any).lastName}`.trim();
//             } else if ((entity as any).firstName) {
//               chatName = (entity as any).firstName;
//             } else if ((entity as any).username) {
//               chatName = `@${(entity as any).username}`;
//             } else {
//               chatName = `Telegram ${originalChatId}`;
//             }

//             // 确定聊天类型
//             let chatType: 'private' | 'group' | 'channel' | 'bot' = 'private';
//             let memberCount: number | undefined;

//             if ((entity as any).className === 'Channel') {
//               chatType = (entity as any).broadcast ? 'channel' : 'group';
//               memberCount = (entity as any).participantsCount;
//             } else if ((entity as any).className === 'Chat') {
//               chatType = 'group';
//               memberCount = (entity as any).participantsCount;
//             } else if ((entity as any).className === 'User') {
//               chatType = (entity as any).bot ? 'bot' : 'private';
//             }

//             // 获取头像信息
//             let avatar = '';
//             try {
//               if ((entity as any).photo) {
//                 const photo = (entity as any).photo;
//                 console.log(`🔍 [调试] ${chatName} 有photo对象:`, {
//                   className: photo.className,
//                   hasPhotoId: !!photo.photoId,
//                   hasDcId: !!photo.dcId,
//                   photoId: photo.photoId?.toString(),
//                   dcId: photo.dcId
//                 });

//                 // 检查是否有有效的photoId和dcId
//                 if (photo.photoId && photo.dcId && photo.className !== 'ChatPhotoEmpty') {
//                   // 尝试下载真实的Telegram头像
//                   console.log(`🔍 [调试] ${chatName} 尝试下载真实头像...`);
//                   const realAvatar = await downloadTelegramAvatar(client, entity);

//                   if (realAvatar) {
//                     avatar = realAvatar;
//                     console.log(`🖼️ [完整版] ${account.id} 真实头像下载成功: ${chatName}`);
//                   } else {
//                     // 下载失败，使用占位符
//                     avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random&bold=true`;
//                     console.log(`🖼️ [完整版] ${account.id} 真实头像下载失败，使用占位符: ${chatName}`);
//                   }
//                 } else {
//                   // photo对象无效，使用占位符
//                   avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random`;
//                   console.log(`🖼️ [完整版] ${account.id} 占位符头像: ${avatar} (${chatName}) - photo无效`);
//                 }
//               } else if ((entity as any).username) {
//                 // 没有photo但有用户名，尝试使用用户名头像
//                 avatar = `https://t.me/i/userpic/320/${(entity as any).username}.jpg`;
//                 console.log(`🖼️ [完整版] ${account.id} 用户名头像: ${avatar} (${chatName})`);
//               } else {
//                 // 没有photo也没有用户名，使用占位符
//                 avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random`;
//                 console.log(`🖼️ [完整版] ${account.id} 占位符头像: ${avatar} (${chatName}) - 无photo无用户名`);
//               }

//             } catch (avatarError) {
//               console.log(`⚠️ [完整版] 获取头像失败: ${account.id}`, avatarError);
//               // 出错时使用占位符
//               avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random`;
//             }

//             // 获取最后消息信息
//             let lastMessage = '';
//             let lastMessageTime = Date.now();
//             let lastMessageSender = '';

//             if (message) {
//               // 获取消息内容
//               if ((message as any).message) {
//                 lastMessage = (message as any).message;
//               } else if ((message as any).action) {
//                 lastMessage = `[${(message as any).action}]`;
//               } else if ((message as any).media) {
//                 lastMessage = '[媒体消息]';
//               }

//               // 获取消息时间
//               if ((message as any).date) {
//                 lastMessageTime = (message as any).date * 1000;
//               }

//               // 获取发送者信息
//               if ((message as any).fromId) {
//                 const fromId = (message as any).fromId;
//                 if (fromId.className === 'User') {
//                   lastMessageSender = (fromId as any).firstName || (fromId as any).username || '未知用户';
//                 } else if (fromId.className === 'Channel') {
//                   lastMessageSender = (fromId as any).title || '频道';
//                 }
//               }
//             }

//             // 获取未读消息数
//             const unreadCount = dialog.unreadCount || 0;

//             // 确定在线状态（简化判断）
//             let status: 'online' | 'offline' | 'away' | 'typing' = 'offline';
//             if (unreadCount > 0) {
//               status = 'online'; // 有未读消息认为是在线
//             }

//             // 构造稳定的 groupId（Telegram）
//             const tgGroupId = `telegram:peer:${originalChatId}`

//             const chatInfo: ChatInfo = {
//               id: `tg-${account.id}-${originalChatId}`,
//               platform: 'telegram',
//               accountId: account.id,
//               groupId: tgGroupId,
//               name: chatName,
//               avatar: avatar,
//               type: chatType,
//               username: (entity as any).username,
//               chatType: chatType,
//               memberCount: memberCount,
//               lastMessage: lastMessage,
//               lastMessageTime: lastMessageTime,
//               lastMessageSender: lastMessageSender,
//               unreadCount: unreadCount,
//               status: status,
//               createdAt: Date.now() - 86400000, // 假设1天前创建
//               updatedAt: Date.now()
//             };

//             accountChats.push(chatInfo);
//           } catch (dialogError) {
//             console.log(`⚠️ [完整版] 处理Telegram对话失败: ${account.id}`, dialogError);
//           }
//         }

//         return accountChats;

//       } catch (accountError) {
//         console.error(`❌ [完整版] Telegram账号处理失败: ${account.id}`, accountError);
//         return [];
//       }
//     });

//     const accountChatsArrays = await Promise.all(accountChatPromises);
//     const allChats: ChatInfo[] = [];
//     for (const accountChats of accountChatsArrays) {
//       allChats.push(...accountChats);
//     }

//     console.log(`📋 [完整版] 总共获取到 ${allChats.length} 个Telegram聊天`);
//     console.log("✅ [完整版] getTelegramChatsComplete() 函数执行完成");
//     return allChats;
//   } catch (error) {
//     console.error("❌ [完整版] 获取Telegram聊天失败:", error);
//     return [];
//   }
// }

/**
 * 获取特定聊天的消息 - 使用Provider模式
 */
export async function getChatMessages(chatId: string, limit: number = 20): Promise<ChatMessagesResponse> {
  try {
    console.log(`🚀 [消息服务] 获取聊天消息: ${chatId}, 限制: ${limit}`);

    let normalizedChatId = chatId;
    

    const prefix = normalizedChatId.split(":")[0]; // wa / tg
    const provider = getProvider(prefix);

    if (!provider) {
      throw new Error(`未知平台: ${prefix}`);
    }

    console.log(`📱 [消息服务] 使用 ${prefix} 提供者`);

    // 轻量级轮询节流：同一 chatId 在短TTL内返回缓存，降低后端压力
    const CACHE_TTL_MS = 2500; // 5秒 (可调整: 3000=3秒, 5000=5秒, 10000=10秒)
    const cacheKey = `${normalizedChatId}::${limit}`;
    const now = Date.now();
    (global as any).__chatMsgCache = (global as any).__chatMsgCache || new Map<string, { data: ChatMessagesResponse; ts: number }>();
    const cache: Map<string, { data: ChatMessagesResponse; ts: number }> = (global as any).__chatMsgCache;
    const hit = cache.get(cacheKey);
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      // 命中缓存，直接返回，避免频繁触发 provider.getMessages
      return hit.data;
    }

    const result = await provider.getMessages(normalizedChatId, limit);
    cache.set(cacheKey, { data: result, ts: now });
    return result;

  } catch (error) {
    console.error("❌ [消息服务] 获取聊天消息失败:", error);
    return { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
  }
}

/**
 * 获取Provider实例
 */
function getProvider(platform: string): any {
  const providers: Record<string, any> = {
    wa: new (require('../provider/whatsapp-provider').WhatsAppProvider)(),
    tg: new (require('../provider/telegram-provider').TelegramProvider)(),
  };

  return providers[platform];
}

// WhatsApp消息获取逻辑已迁移到 WhatsAppProvider

// Telegram消息获取逻辑已迁移到 TelegramProvider