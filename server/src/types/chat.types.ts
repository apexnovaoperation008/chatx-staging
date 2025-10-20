export interface ChatMessage {
  id: string;
  chatId: string;
  sender: string;
  senderName?: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
  messageType: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'voice' | 'location' | 'contact' | 'action' | 'buttons_response' | 'list_response' | 'order' | 'revoked' | 'contact_multi' | 'encrypted' |'system' |'service'| 'unknown';
  status: 'sent' | 'delivered' | 'read';
  fileName?: string; // 文档文件名（仅用于document类型）
  fileHash?: string; // 文件内容哈希用于去重
  senderAvatar?: string; // 发送者头像
  geo?: {
    lat: number;
    long: number;
  }; // 地理位置信息（仅用于location类型）
  
  // 按钮响应消息
  buttonResponse?: {
    selectedButtonId: string;
    selectedButtonText: string;
  };
  
  // 列表响应消息
  listResponse?: {
    selectedListId: string;
    selectedOptionId: string;
    selectedOptionText: string;
  };
  
  // 订单消息
  orderData?: {
    orderId: string;
    orderStatus: string;
    orderTotal: number;
    currency: string;
  };
  
  // 联系人卡片（多个）
  contacts?: Array<{
    name: string;
    phone: string;
    email?: string;
  }>;
  
  // 撤回消息信息
  revokedInfo?: {
    originalMessageId: string;
    revokedBy: string;
    revokedAt: number;
  };
}

export interface ChatInfo {
  id: string;
  platform: 'whatsapp' | 'telegram';
  accountId: string; // 关联的账号ID
  // 跨账号稳定分组ID（同一会话/群在不同账号下应一致）
  groupId?: string;
  
  // 基本信息
  name: string; // 联系人姓名或群组名称
  avatar?: string;
  
  // 聊天类型
  type: 'private' | 'group' | 'channel' | 'bot' | 'system' | 'topic';
  
  // WhatsApp特有
  phoneNumber?: string; // 私聊时的手机号
  isVerified?: boolean; // 是否为认证账号
  
  // Telegram特有
  username?: string; // Telegram用户名
  chatType?: 'private' | 'group' | 'supergroup' | 'channel' | 'bot';
  topicId?: number; // Topic ID (如果是Topic)
  
  // 群组信息
  memberCount?: number; // 群组成员数量
  
  // 最后消息
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageSender?: string;
  
  // 状态
  unreadCount: number;
  status: 'online' | 'offline' | 'away' | 'typing';
  
  // 时间
  createdAt: number;
  updatedAt: number;
}

export interface ChatListResponse {
  chats: ChatInfo[];
  totalCount: number;
  hasMore: boolean;
}

export interface Workspace {
  id: number;
  name: string;
  manager_id: number;
  // add other columns if needed
}

export interface Account {
  id: string;
  session_id: string;
  workspace_id: number;
  brand_id: number | null;
  display_name?: string;
  description?: string;
  phone_number?: string;
  is_active?: boolean;
  created_at?: Date;
  username?:string;
  name?:string;
  created_by?:number;
}

export interface MessageResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface MessageProvider {
  getMessages(chatId: string, limit: number): Promise<MessageResponse>;
  sendMessage(chatId: string, content: string, messageType?: string, file?: any): Promise<boolean | { success: boolean; fileHash?: string; fileName?: string }>;
  getChats(accountId: string): Promise<ChatInfo[]>;

}

export interface ChatMessagesResponse {
  chatInfo: ChatInfo;
  messages: ChatMessage[];
  hasMore: boolean;
}