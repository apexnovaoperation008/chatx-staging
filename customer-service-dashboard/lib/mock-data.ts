/**
 * 虚拟数据文件
 * 包含模拟的账户和对话数据，用于开发和测试
 */

import { AccountInfo } from './account-management-api'
import { ChatInfo, ChatMessage } from './chat-api'

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

// 虚拟账户数据
export const mockAccounts: AccountInfo[] = [
  // WhatsApp 账户
  {
    id: "wa-001",
    platform: "whatsapp",
    displayName: "Wang CS",
    phoneNumber: "+86 138****1234",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T10:30:00Z",
    messageCount: 1250,
    createdAt: "2024-01-01T00:00:00Z",
    description: "Main customer service account"
  },
  {
    id: "wa-002", 
    platform: "whatsapp",
    displayName: "Li Sales",
    phoneNumber: "+86 139****5678",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T09:45:00Z",
    messageCount: 890,
    createdAt: "2024-01-05T00:00:00Z",
    description: "Sales account"
  },
  {
    id: "wa-003",
    platform: "whatsapp", 
    displayName: "Tech Support",
    phoneNumber: "+86 137****9012",
    status: "disconnected",
    isActive: false,
    lastSeen: "2024-01-14T18:20:00Z",
    messageCount: 456,
    createdAt: "2024-01-10T00:00:00Z",
    description: "Technical support account"
  },
  {
    id: "wa-004",
    displayName: "Zhang CS",
    platform: "whatsapp",
    phoneNumber: "+86 136****3456",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T11:15:00Z",
    messageCount: 2100,
    createdAt: "2023-12-20T00:00:00Z",
    description: "Senior customer service account"
  },
  {
    id: "wa-005",
    platform: "whatsapp",
    displayName: "Chen CS",
    phoneNumber: "+86 135****7890",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T08:20:00Z",
    messageCount: 1680,
    createdAt: "2023-11-15T00:00:00Z",
    description: "Night shift customer service account"
  },
  {
    id: "wa-006",
    platform: "whatsapp",
    displayName: "Liu Sales",
    phoneNumber: "+86 134****2468",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T07:30:00Z",
    messageCount: 920,
    createdAt: "2023-12-01T00:00:00Z",
    description: "Sales assistant account"
  },
  {
    id: "wa-007",
    platform: "whatsapp",
    displayName: "Zhao CS",
    phoneNumber: "+86 133****1357",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T11:45:00Z",
    messageCount: 1450,
    createdAt: "2023-10-20T00:00:00Z",
    description: "VIP customer service account"
  },
  {
    id: "wa-008",
    platform: "whatsapp",
    displayName: "Sun Tech",
    phoneNumber: "+86 132****9753",
    status: "disconnected",
    isActive: false,
    lastSeen: "2024-01-12T14:15:00Z",
    messageCount: 320,
    createdAt: "2024-01-08T00:00:00Z",
    description: "Temporary technical support account"
  },

  // Telegram 账户
  {
    id: "tg-001",
    platform: "telegram",
    displayName: "CS Bot",
    username: "customer_service_bot",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T10:45:00Z",
    messageCount: 3200,
    createdAt: "2023-12-01T00:00:00Z",
    description: "Automated customer service bot"
  },
  {
    id: "tg-002",
    platform: "telegram",
    displayName: "Sales Manager",
    username: "sales_manager",
    status: "connected", 
    isActive: true,
    lastSeen: "2024-01-15T09:30:00Z",
    messageCount: 1800,
    createdAt: "2023-12-15T00:00:00Z",
    description: "Sales management account"
  },
  {
    id: "tg-003",
    platform: "telegram",
    displayName: "Product Manager",
    username: "product_manager",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T08:20:00Z", 
    messageCount: 950,
    createdAt: "2024-01-01T00:00:00Z",
    description: "Product management account"
  },
  {
    id: "tg-004",
    platform: "telegram",
    displayName: "Tech Support",
    username: "tech_support",
    status: "disconnected",
    isActive: false,
    lastSeen: "2024-01-13T16:30:00Z",
    messageCount: 680,
    createdAt: "2023-12-25T00:00:00Z",
    description: "Technical support account"
  },
  {
    id: "tg-005",
    platform: "telegram",
    displayName: "Zhou CS",
    username: "customer_zhou",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T11:00:00Z",
    messageCount: 2100,
    createdAt: "2023-11-10T00:00:00Z",
    description: "Senior customer service specialist"
  },
  {
    id: "tg-006",
    platform: "telegram",
    displayName: "Wu Sales",
    username: "sales_wu",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T06:45:00Z",
    messageCount: 1350,
    createdAt: "2023-12-05T00:00:00Z",
    description: "Overseas sales specialist"
  },
  {
    id: "tg-007",
    platform: "telegram",
    displayName: "Zheng Product",
    username: "product_zheng",
    status: "connected",
    isActive: true,
    lastSeen: "2024-01-15T10:15:00Z",
    messageCount: 780,
    createdAt: "2023-12-20T00:00:00Z",
    description: "Product operations specialist"
  },
  {
    id: "tg-008",
    platform: "telegram",
    displayName: "Feng Tech",
    username: "tech_feng",
    status: "disconnected",
    isActive: false,
    lastSeen: "2024-01-11T20:30:00Z",
    messageCount: 420,
    createdAt: "2024-01-03T00:00:00Z",
    description: "System maintenance specialist"
  }
]

// 虚拟聊天数据
export const mockChats: ChatInfo[] = [
  // WhatsApp 私聊
  {
    id: "chat-wa-001",
    platform: "whatsapp",
    accountId: "wa-001",
    name: "Xiao Ming Zhang",
    avatar: generateDefaultAvatar("Xiao Ming Zhang"),
    type: "private",
    phoneNumber: "+86 138****8888",
    isVerified: true,
    unreadCount: 2,
    status: "online",
    lastMessage: "When can the product be shipped?",
    lastMessageTime: Date.now() - 2 * 60 * 1000, // 2 minutes ago
    lastMessageSender: "Xiao Ming Zhang",
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7天前
    updatedAt: Date.now() - 2 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-002", 
    platform: "whatsapp",
    accountId: "wa-001",
    name: "Xiao Hong Li",
    avatar: generateDefaultAvatar("Xiao Hong Li"),
    type: "private",
    phoneNumber: "+86 139****9999",
    isVerified: false,
    unreadCount: 0,
    status: "offline",
    lastMessage: "Thank you for your help!",
    lastMessageTime: Date.now() - 30 * 60 * 1000, // 30 minutes ago
    lastMessageSender: "Xiao Hong Li",
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3天前
    updatedAt: Date.now() - 30 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-003",
    platform: "whatsapp", 
    accountId: "wa-002",
    name: "Engineer Wang",
    avatar: generateDefaultAvatar("Engineer Wang"),
    type: "private",
    phoneNumber: "+86 137****7777",
    isVerified: true,
    unreadCount: 1,
    status: "online",
    lastMessage: "This issue has been fixed",
    lastMessageTime: Date.now() - 15 * 60 * 1000, // 15 minutes ago
    lastMessageSender: "Engineer Wang",
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5天前
    updatedAt: Date.now() - 15 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-004",
    platform: "whatsapp",
    accountId: "wa-003",
    name: "Manager Chen",
    avatar: generateDefaultAvatar("Manager Chen"),
    type: "private",
    phoneNumber: "+86 136****5555",
    isVerified: true,
    unreadCount: 0,
    status: "online",
    lastMessage: "Okay, I'll arrange it right away",
    lastMessageTime: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    lastMessageSender: "Manager Chen",
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2天前
    updatedAt: Date.now() - 1 * 60 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-005",
    platform: "whatsapp",
    accountId: "wa-004",
    name: "Director Liu",
    avatar: generateDefaultAvatar("Director Liu"),
    type: "private",
    phoneNumber: "+86 135****3333",
    isVerified: true,
    unreadCount: 3,
    status: "online",
    lastMessage: "This plan is good, let's proceed",
    lastMessageTime: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    lastMessageSender: "Director Liu",
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10天前
    updatedAt: Date.now() - 5 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-006",
    platform: "whatsapp",
    accountId: "wa-005",
    name: "Ms. Zhao",
    avatar: generateDefaultAvatar("Ms. Zhao"),
    type: "private",
    phoneNumber: "+86 134****7777",
    isVerified: false,
    unreadCount: 0,
    status: "offline",
    lastMessage: "Thanks, I'll think about it",
    lastMessageTime: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    lastMessageSender: "Ms. Zhao",
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1天前
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-007",
    platform: "whatsapp",
    accountId: "wa-006",
    name: "Mr. Sun",
    avatar: generateDefaultAvatar("Mr. Sun"),
    type: "private",
    phoneNumber: "+86 133****9999",
    isVerified: true,
    unreadCount: 1,
    status: "online",
    lastMessage: "Can you offer a better price?",
    lastMessageTime: Date.now() - 45 * 60 * 1000, // 45 minutes ago
    lastMessageSender: "Mr. Sun",
    createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4天前
    updatedAt: Date.now() - 45 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-wa-008",
    platform: "whatsapp",
    accountId: "wa-007",
    name: "Director Zhou",
    avatar: generateDefaultAvatar("Director Zhou"),
    type: "private",
    phoneNumber: "+86 132****1111",
    isVerified: true,
    unreadCount: 0,
    status: "online",
    lastMessage: "Great working with you!",
    lastMessageTime: Date.now() - 20 * 60 * 1000, // 20 minutes ago
    lastMessageSender: "Director Zhou",
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15天前
    updatedAt: Date.now() - 20 * 60 * 1000,
    groupId: ""
  },

  // WhatsApp 群聊
  {
    id: "chat-wa-group-001",
    platform: "whatsapp",
    accountId: "wa-001",
    name: "Product Discussion",
    avatar: generateDefaultAvatar("Product Discussion"),
    type: "group",
    memberCount: 24,
    unreadCount: 5,
    status: "online",
    lastMessage: "Xiao Hong Li: Any suggestions for the new features?",
    lastMessageTime: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    lastMessageSender: "Xiao Hong Li",
    groupId: "group-product-discussion",
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30天前
    updatedAt: Date.now() - 5 * 60 * 1000
  },
  {
    id: "chat-wa-group-002",
    platform: "whatsapp",
    accountId: "wa-002", 
    name: "Product Discussion",
    avatar: generateDefaultAvatar("Product Discussion"),
    type: "group",
    memberCount: 24,
    unreadCount: 3,
    status: "online",
    lastMessage: "Engineer Wang: This issue has been fixed",
    lastMessageTime: Date.now() - 10 * 60 * 1000, // 10 minutes ago
    lastMessageSender: "Engineer Wang",
    groupId: "group-product-discussion",
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30天前
    updatedAt: Date.now() - 10 * 60 * 1000
  },
  {
    id: "chat-wa-group-003",
    platform: "whatsapp",
    accountId: "wa-004",
    name: "Product Discussion",
    avatar: generateDefaultAvatar("Product Discussion"),
    type: "group",
    memberCount: 24,
    unreadCount: 0,
    status: "online",
    lastMessage: "Zhang CS: I agree with this plan",
    lastMessageTime: Date.now() - 2 * 60 * 1000, // 2 minutes ago
    lastMessageSender: "Zhang CS",
    groupId: "group-product-discussion",
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30天前
    updatedAt: Date.now() - 2 * 60 * 1000
  },
  {
    id: "chat-wa-group-004",
    platform: "whatsapp",
    accountId: "wa-001",
    name: "CS Work Group",
    avatar: generateDefaultAvatar("CS Work Group"),
    type: "group",
    memberCount: 12,
    unreadCount: 2,
    status: "online",
    lastMessage: "Chen CS: All tickets have been processed today",
    lastMessageTime: Date.now() - 8 * 60 * 1000, // 8 minutes ago
    lastMessageSender: "Chen CS",
    groupId: "group-customer-service",
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000, // 45天前
    updatedAt: Date.now() - 8 * 60 * 1000
  },
  {
    id: "chat-wa-group-005",
    platform: "whatsapp",
    accountId: "wa-005",
    name: "CS Work Group",
    avatar: generateDefaultAvatar("CS Work Group"),
    type: "group",
    memberCount: 12,
    unreadCount: 1,
    status: "online",
    lastMessage: "Chen CS: Night shift handover completed",
    lastMessageTime: Date.now() - 3 * 60 * 1000, // 3 minutes ago
    lastMessageSender: "Chen CS",
    groupId: "group-customer-service",
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000, // 45天前
    updatedAt: Date.now() - 3 * 60 * 1000
  },

  // Telegram 私聊
  {
    id: "chat-tg-001",
    platform: "telegram",
    accountId: "tg-001",
    name: "John Smith",
    avatar: generateDefaultAvatar("John Smith"),
    type: "private",
    username: "@johnsmith",
    unreadCount: 0,
    status: "offline",
    lastMessage: "Thank you for your help!",
    lastMessageTime: Date.now() - 2 * 60 * 60 * 1000, // 2小时前
    lastMessageSender: "John Smith",
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10天前
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-tg-002",
    platform: "telegram",
    accountId: "tg-002",
    name: "Alice Johnson",
    avatar: generateDefaultAvatar("Alice Johnson"),
    type: "private", 
    username: "@alicej",
    unreadCount: 1,
    status: "online",
    lastMessage: "Can you help me with the pricing?",
    lastMessageTime: Date.now() - 45 * 60 * 1000, // 45分钟前
    lastMessageSender: "Alice Johnson",
    createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000, // 14天前
    updatedAt: Date.now() - 45 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-tg-003",
    platform: "telegram",
    accountId: "tg-003",
    name: "Michael Brown",
    avatar: generateDefaultAvatar("Michael Brown"),
    type: "private",
    username: "@michaelb",
    unreadCount: 0,
    status: "online",
    lastMessage: "The new feature looks great!",
    lastMessageTime: Date.now() - 1 * 60 * 60 * 1000, // 1小时前
    lastMessageSender: "Michael Brown",
    createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8天前
    updatedAt: Date.now() - 1 * 60 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-tg-004",
    platform: "telegram",
    accountId: "tg-004",
    name: "Sarah Wilson",
    avatar: generateDefaultAvatar("Sarah Wilson"),
    type: "private",
    username: "@sarahw",
    unreadCount: 2,
    status: "online",
    lastMessage: "When will the update be available?",
    lastMessageTime: Date.now() - 30 * 60 * 1000, // 30分钟前
    lastMessageSender: "Sarah Wilson",
    createdAt: Date.now() - 12 * 24 * 60 * 60 * 1000, // 12天前
    updatedAt: Date.now() - 30 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-tg-005",
    platform: "telegram",
    accountId: "tg-005",
    name: "David Lee",
    avatar: generateDefaultAvatar("David Lee"),
    type: "private",
    username: "@davidl",
    unreadCount: 0,
    status: "offline",
    lastMessage: "Thanks for the quick response!",
    lastMessageTime: Date.now() - 3 * 60 * 60 * 1000, // 3小时前
    lastMessageSender: "David Lee",
    createdAt: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6天前
    updatedAt: Date.now() - 3 * 60 * 60 * 1000,
    groupId: ""
  },
  {
    id: "chat-tg-006",
    platform: "telegram",
    accountId: "tg-006",
    name: "Emma Davis",
    avatar: generateDefaultAvatar("Emma Davis"),
    type: "private",
    username: "@emmad",
    unreadCount: 1,
    status: "online",
    lastMessage: "I need help with the integration",
    lastMessageTime: Date.now() - 15 * 60 * 1000, // 15分钟前
    lastMessageSender: "Emma Davis",
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5天前
    updatedAt: Date.now() - 15 * 60 * 1000,
    groupId: ""
  },

  // Telegram 群组
  {
    id: "chat-tg-group-001",
    platform: "telegram",
    accountId: "tg-001",
    name: "Tech Support Group",
    avatar: generateDefaultAvatar("Tech Support Group"),
    type: "group",
    memberCount: 12,
    unreadCount: 1,
    status: "online",
    lastMessage: "Engineer Wang: This issue has been fixed",
    lastMessageTime: Date.now() - 15 * 60 * 1000, // 15 minutes ago
    lastMessageSender: "Engineer Wang",
    groupId: "group-tech-support",
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000, // 20天前
    updatedAt: Date.now() - 15 * 60 * 1000
  },
  {
    id: "chat-tg-group-002", 
    platform: "telegram",
    accountId: "tg-002",
    name: "Tech Support Group",
    avatar: generateDefaultAvatar("Tech Support Group"),
    type: "group",
    memberCount: 12,
    unreadCount: 0,
    status: "online",
    lastMessage: "Alice: Thanks for the quick fix!",
    lastMessageTime: Date.now() - 8 * 60 * 1000, // 8 minutes ago
    lastMessageSender: "Alice",
    groupId: "group-tech-support",
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000, // 20天前
    updatedAt: Date.now() - 8 * 60 * 1000
  },
  {
    id: "chat-tg-group-003",
    platform: "telegram",
    accountId: "tg-004",
    name: "Tech Support Group",
    avatar: generateDefaultAvatar("Tech Support Group"),
    type: "group",
    memberCount: 12,
    unreadCount: 2,
    status: "online",
    lastMessage: "Tech Support: Please provide more details",
    lastMessageTime: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    lastMessageSender: "Tech Support",
    groupId: "group-tech-support",
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000, // 20天前
    updatedAt: Date.now() - 5 * 60 * 1000
  },
  {
    id: "chat-tg-group-004",
    platform: "telegram",
    accountId: "tg-001",
    name: "Product Feedback",
    avatar: generateDefaultAvatar("Product Feedback"),
    type: "group",
    memberCount: 8,
    unreadCount: 0,
    status: "online",
    lastMessage: "Product Manager: New version coming soon",
    lastMessageTime: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    lastMessageSender: "Product Manager",
    groupId: "group-product-feedback",
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15天前
    updatedAt: Date.now() - 1 * 60 * 60 * 1000
  },
  {
    id: "chat-tg-group-005",
    platform: "telegram",
    accountId: "tg-003",
    name: "Product Feedback",
    avatar: generateDefaultAvatar("Product Feedback"),
    type: "group",
    memberCount: 8,
    unreadCount: 1,
    status: "online",
    lastMessage: "Zheng Product: User feedback collected",
    lastMessageTime: Date.now() - 25 * 60 * 1000, // 25 minutes ago
    lastMessageSender: "Zheng Product",
    groupId: "group-product-feedback",
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15天前
    updatedAt: Date.now() - 25 * 60 * 1000
  },

  // Telegram 频道
  {
    id: "chat-tg-channel-001",
    platform: "telegram",
    accountId: "tg-003",
    name: "Product Updates",
    avatar: generateDefaultAvatar("Product Updates"),
    type: "channel",
    memberCount: 500,
    unreadCount: 0,
    status: "online",
    lastMessage: "Version v2.1.0 has been released with the following new features...",
    lastMessageTime: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
    lastMessageSender: "Product Manager",
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60天前
    updatedAt: Date.now() - 3 * 60 * 60 * 1000,
    groupId: "channel-product-updates"
  },
  {
    id: "chat-tg-channel-002",
    platform: "telegram",
    accountId: "tg-007",
    name: "Product Updates",
    avatar: generateDefaultAvatar("Product Updates"),
    type: "channel",
    memberCount: 500,
    unreadCount: 1,
    status: "online",
    lastMessage: "Zheng Product: Fixed known issues",
    lastMessageTime: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    lastMessageSender: "Zheng Product",
    groupId: "channel-product-updates",
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60天前
    updatedAt: Date.now() - 1 * 60 * 60 * 1000
  }
]

// 虚拟消息数据
export const mockMessages: { [chatId: string]: ChatMessage[] } = {
  "chat-wa-001": [
    {
      id: "msg-001",
      chatId: "chat-wa-001",
      sender: "Xiao Ming Zhang",
      senderName: "Xiao Ming Zhang",
      content: "Hi, I'd like to inquire about your products",
      timestamp: Date.now() - 2 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-002", 
      chatId: "chat-wa-001",
      sender: "Wang CS",
      senderName: "Wang CS",
      content: "Hello! Happy to help you. Which product would you like to know about?",
      timestamp: Date.now() - 1.5 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-003",
      chatId: "chat-wa-001", 
      sender: "Xiao Ming Zhang",
      senderName: "Xiao Ming Zhang",
      content: "The smartwatch featured on your homepage",
      timestamp: Date.now() - 1 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-004",
      chatId: "chat-wa-001",
      sender: "Xiao Ming Zhang", 
      senderName: "Xiao Ming Zhang",
      content: "When can this product be shipped?",
      timestamp: Date.now() - 2 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "delivered"
    }
  ],
  "chat-wa-002": [
    {
      id: "msg-wa-002-001",
      chatId: "chat-wa-002",
      sender: "Xiao Hong Li",
      senderName: "Xiao Hong Li",
      content: "Hi, I'd like to know about your product prices",
      timestamp: Date.now() - 35 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-002-002",
      chatId: "chat-wa-002",
      sender: "Wang CS",
      senderName: "Wang CS",
      content: "Hello! Our product prices vary based on configuration. Which product are you interested in?",
      timestamp: Date.now() - 33 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-002-003",
      chatId: "chat-wa-002",
      sender: "Xiao Hong Li",
      senderName: "Xiao Hong Li",
      content: "Thank you for your help!",
      timestamp: Date.now() - 30 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-003": [
    {
      id: "msg-wa-003-001",
      chatId: "chat-wa-003",
      sender: "Engineer Wang",
      senderName: "Engineer Wang",
      content: "There's a bug in the system that needs urgent fixing",
      timestamp: Date.now() - 20 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-003-002",
      chatId: "chat-wa-003",
      sender: "Li Sales",
      senderName: "Li Sales",
      content: "Okay, I'll contact the tech team right away",
      timestamp: Date.now() - 18 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-003-003",
      chatId: "chat-wa-003",
      sender: "Engineer Wang",
      senderName: "Engineer Wang",
      content: "This issue has been fixed",
      timestamp: Date.now() - 15 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-004": [
    {
      id: "msg-wa-004-001",
      chatId: "chat-wa-004",
      sender: "Manager Chen",
      senderName: "Manager Chen",
      content: "We need to discuss next quarter's sales plan",
      timestamp: Date.now() - 70 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-004-002",
      chatId: "chat-wa-004",
      sender: "Tech Support",
      senderName: "Tech Support",
      content: "Okay, I'll arrange it right away",
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-005": [
    {
      id: "msg-wa-005-001",
      chatId: "chat-wa-005",
      sender: "Director Liu",
      senderName: "Director Liu",
      content: "This plan is good, let's proceed",
      timestamp: Date.now() - 5 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-005-002",
      chatId: "chat-wa-005",
      sender: "Zhang CS",
      senderName: "Zhang CS",
      content: "Okay, I'll continue to follow up on this project",
      timestamp: Date.now() - 3 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-006": [
    {
      id: "msg-wa-006-001",
      chatId: "chat-wa-006",
      sender: "Ms. Zhao",
      senderName: "Ms. Zhao",
      content: "I'd like to learn about your products",
      timestamp: Date.now() - 2.5 * 60 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-006-002",
      chatId: "chat-wa-006",
      sender: "Chen CS",
      senderName: "Chen CS",
      content: "Hello! Happy to introduce our products to you",
      timestamp: Date.now() - 2.3 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-006-003",
      chatId: "chat-wa-006",
      sender: "Ms. Zhao",
      senderName: "Ms. Zhao",
      content: "Thanks, I'll think about it",
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-007": [
    {
      id: "msg-wa-007-001",
      chatId: "chat-wa-007",
      sender: "Mr. Sun",
      senderName: "Mr. Sun",
      content: "Can you offer a better price?",
      timestamp: Date.now() - 45 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-007-002",
      chatId: "chat-wa-007",
      sender: "Liu Sales",
      senderName: "Liu Sales",
      content: "I can request a special discount for you",
      timestamp: Date.now() - 40 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-008": [
    {
      id: "msg-wa-008-001",
      chatId: "chat-wa-008",
      sender: "Director Zhou",
      senderName: "Director Zhou",
      content: "Great working with you!",
      timestamp: Date.now() - 20 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-wa-008-002",
      chatId: "chat-wa-008",
      sender: "Zhao CS",
      senderName: "Zhao CS",
      content: "Thank you for your trust, looking forward to working with you again!",
      timestamp: Date.now() - 18 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-group-001": [
    {
      id: "msg-g-001",
      chatId: "chat-wa-group-001",
      sender: "Xiao Hong Li",
      senderName: "Xiao Hong Li",
      content: "Any suggestions for the new features?",
      timestamp: Date.now() - 5 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-g-002",
      chatId: "chat-wa-group-001",
      sender: "Engineer Wang",
      senderName: "Engineer Wang", 
      content: "I think we could add an auto-backup feature",
      timestamp: Date.now() - 3 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-group-002": [
    {
      id: "msg-g-002-001",
      chatId: "chat-wa-group-002",
      sender: "Engineer Wang",
      senderName: "Engineer Wang",
      content: "This issue has been fixed",
      timestamp: Date.now() - 10 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-g-002-002",
      chatId: "chat-wa-group-002",
      sender: "Li Sales",
      senderName: "Li Sales",
      content: "Great, the customer should be satisfied",
      timestamp: Date.now() - 8 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-group-003": [
    {
      id: "msg-g-003-001",
      chatId: "chat-wa-group-003",
      sender: "Zhang CS",
      senderName: "Zhang CS",
      content: "I agree with this plan",
      timestamp: Date.now() - 2 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-group-004": [
    {
      id: "msg-g-004-001",
      chatId: "chat-wa-group-004",
      sender: "Chen CS",
      senderName: "Chen CS",
      content: "All tickets have been processed today",
      timestamp: Date.now() - 8 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-g-004-002",
      chatId: "chat-wa-group-004",
      sender: "Wang CS",
      senderName: "Wang CS",
      content: "Good job!",
      timestamp: Date.now() - 5 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-wa-group-005": [
    {
      id: "msg-g-005-001",
      chatId: "chat-wa-group-005",
      sender: "Chen CS",
      senderName: "Chen CS",
      content: "Night shift handover completed",
      timestamp: Date.now() - 3 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-001": [
    {
      id: "msg-tg-001",
      chatId: "chat-tg-001",
      sender: "John Smith",
      senderName: "John Smith",
      content: "Hello, I need help with my order",
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-002",
      chatId: "chat-tg-001",
      sender: "客服Bot",
      senderName: "客服Bot",
      content: "Hi John! I'd be happy to help you with your order. Can you please provide your order number?",
      timestamp: Date.now() - 1.5 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-003",
      chatId: "chat-tg-001",
      sender: "John Smith",
      senderName: "John Smith",
      content: "Thank you for your help!",
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-002": [
    {
      id: "msg-tg-002-001",
      chatId: "chat-tg-002",
      sender: "Alice Johnson",
      senderName: "Alice Johnson",
      content: "Can you help me with the pricing?",
      timestamp: Date.now() - 45 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-002-002",
      chatId: "chat-tg-002",
      sender: "销售经理",
      senderName: "销售经理",
      content: "Of course! I'll send you our latest price list",
      timestamp: Date.now() - 40 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-003": [
    {
      id: "msg-tg-003-001",
      chatId: "chat-tg-003",
      sender: "Michael Brown",
      senderName: "Michael Brown",
      content: "The new feature looks great!",
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-003-002",
      chatId: "chat-tg-003",
      sender: "产品经理",
      senderName: "产品经理",
      content: "Thank you! We're glad you like it",
      timestamp: Date.now() - 55 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-004": [
    {
      id: "msg-tg-004-001",
      chatId: "chat-tg-004",
      sender: "Sarah Wilson",
      senderName: "Sarah Wilson",
      content: "When will the update be available?",
      timestamp: Date.now() - 30 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-004-002",
      chatId: "chat-tg-004",
      sender: "技术支持",
      senderName: "技术支持",
      content: "The update will be available next week",
      timestamp: Date.now() - 25 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-005": [
    {
      id: "msg-tg-005-001",
      chatId: "chat-tg-005",
      sender: "David Lee",
      senderName: "David Lee",
      content: "Thanks for the quick response!",
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-005-002",
      chatId: "chat-tg-005",
      sender: "客服小周",
      senderName: "客服小周",
      content: "You're welcome! Happy to help",
      timestamp: Date.now() - 2.5 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-006": [
    {
      id: "msg-tg-006-001",
      chatId: "chat-tg-006",
      sender: "Emma Davis",
      senderName: "Emma Davis",
      content: "I need help with the integration",
      timestamp: Date.now() - 15 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-006-002",
      chatId: "chat-tg-006",
      sender: "销售小吴",
      senderName: "销售小吴",
      content: "I'll connect you with our technical team",
      timestamp: Date.now() - 10 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-group-001": [
    {
      id: "msg-tg-g-001",
      chatId: "chat-tg-group-001",
      sender: "Engineer Wang",
      senderName: "Engineer Wang",
      content: "This issue has been fixed",
      timestamp: Date.now() - 15 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-g-002",
      chatId: "chat-tg-group-001",
      sender: "Alice",
      senderName: "Alice",
      content: "Thanks for the quick fix!",
      timestamp: Date.now() - 8 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-group-002": [
    {
      id: "msg-tg-g-002-001",
      chatId: "chat-tg-group-002",
      sender: "Alice",
      senderName: "Alice",
      content: "Thanks for the quick fix!",
      timestamp: Date.now() - 8 * 60 * 1000,
      isOwn: false,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-g-002-002",
      chatId: "chat-tg-group-002",
      sender: "销售经理",
      senderName: "销售经理",
      content: "You're welcome!",
      timestamp: Date.now() - 5 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-group-003": [
    {
      id: "msg-tg-g-003-001",
      chatId: "chat-tg-group-003",
      sender: "Tech Support",
      senderName: "Tech Support",
      content: "Please provide more details",
      timestamp: Date.now() - 5 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-group-004": [
    {
      id: "msg-tg-g-004-001",
      chatId: "chat-tg-group-004",
      sender: "Product Manager",
      senderName: "Product Manager",
      content: "New version coming soon",
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    },
    {
      id: "msg-tg-g-004-002",
      chatId: "chat-tg-group-004",
      sender: "CS Bot",
      senderName: "CS Bot",
      content: "Great news!",
      timestamp: Date.now() - 50 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-group-005": [
    {
      id: "msg-tg-g-005-001",
      chatId: "chat-tg-group-005",
      sender: "Zheng Product",
      senderName: "Zheng Product",
      content: "User feedback collected",
      timestamp: Date.now() - 25 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-channel-001": [
    {
      id: "msg-tg-c-001",
      chatId: "chat-tg-channel-001",
      sender: "Product Manager",
      senderName: "Product Manager",
      content: "Version v2.1.0 has been released with the following new features...",
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ],
  "chat-tg-channel-002": [
    {
      id: "msg-tg-c-002",
      chatId: "chat-tg-channel-002",
      sender: "Zheng Product",
      senderName: "Zheng Product",
      content: "Fixed known issues",
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      isOwn: true,
      messageType: "text",
      status: "read"
    }
  ]
}

// 导出辅助函数
export const getMockAccounts = (platform?: "whatsapp" | "telegram" | "all"): AccountInfo[] => {
  if (platform === "all" || !platform) {
    return mockAccounts
  }
  return mockAccounts.filter(account => account.platform === platform)
}

export const getMockChats = (platform?: "whatsapp" | "telegram" | "all"): ChatInfo[] => {
  if (platform === "all" || !platform) {
    return mockChats
  }
  return mockChats.filter(chat => chat.platform === platform)
}

export const getMockMessages = (chatId: string): ChatMessage[] => {
  return mockMessages[chatId] || []
}

export const getMockChatById = (chatId: string): ChatInfo | undefined => {
  return mockChats.find(chat => chat.id === chatId)
}

export const getMockAccountById = (accountId: string): AccountInfo | undefined => {
  return mockAccounts.find(account => account.id === accountId)
}
