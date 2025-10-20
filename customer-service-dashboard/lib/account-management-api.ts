/**
 * 账号管理前端API客户端
 * 提供与后端账号管理服务的通信接口
 */

import { api } from './api';

export interface AccountInfo {
  sessionId?: string;
  id: string;
  platform: "whatsapp" | "telegram";
  displayName: string;
  phoneNumber?: string;
  username?: string;
  status: "connected" | "disconnected" | "error";
  isActive: boolean;
  lastSeen: string;
  messageCount: number;
  createdAt: string;
  description?: string;
  workspaceId:number;
  brandId:number;
  warning:boolean
  message:string
  name?:string
}

export interface AccountStats {
  totalAccounts: number;
  connectedAccounts: number;
  activeAccounts: number;
  todayMessages: number;
  whatsappCount: number;
  telegramCount: number;
  whatsappConnected: number;
  telegramConnected: number;
}

/**
 * 账号管理API客户端
 */
export const AccountManagementApi = {
    /**
   * 获取账号列表
   */
  async getAccounts(): Promise<AccountInfo[]> {
    const response = await api('/account-management/accounts');

    // 后端返回结构为 { data: [...] }
    if (response?.data) {
      return response.data;
    }

    console.warn("⚠️ Unexpected accounts response format:", response);
    return [];
  },

  /**
   * 获取账号统计信息
   */
  async getAccountStats(): Promise<AccountStats> {
    const response = await api('/account-management/stats');

    // 后端返回结构为 { data: {...} }
    if (response?.data) {
      return response.data;
    }

    console.warn("⚠️ Unexpected stats response format:", response);
    return {
      totalAccounts: 0,
      connectedAccounts: 0,
      activeAccounts: 0,
      todayMessages: 0,
      whatsappCount: 0,
      telegramCount: 0,
      whatsappConnected: 0,
      telegramConnected: 0,
    };
  },


  /**
   * 获取单个账号详情
   */
  async getAccountById(id: string): Promise<AccountInfo | null> {
    try {
      const response = await api(`/account-management/accounts/${id}`);
      return response.data || null;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * 删除账号
   */
  async deleteAccount(id: string): Promise<{
    ok: boolean;
    provider?: 'whatsapp' | 'telegram';
    message?: string;
    deletedFolder?: string | null;
  }> {
    try {
      const response = await api(`/account-management/accounts/${id}`, {
        method: 'DELETE',
      });

      const data = response?.data ?? response;

      if (data?.ok) {
        return data;
      }

      console.warn('⚠️ 删除账号返回非成功状态:', data);
      return { ok: false, message: data?.message || '删除失败' };
    } catch (error: any) {
      console.error('删除账号失败:', error);
      return { ok: false, message: error?.message || '删除失败' };
    }
  },

  /**
   * 切换账号活跃状态
   */
  async toggleAccountActive(id: string, isActive: boolean): Promise<AccountInfo | null> {
    try {
      console.log(`🔄 [API] 发送切换请求: ${id} -> ${isActive}`);
      const response = await api(`/account-management/accounts/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
  
      // response is already parsed JSON here
      if (response?.ok && response?.data) {
        return {
          id: response.data.id,
          isActive: response.data.isActive,
          platform: response.data.platform,
        } as AccountInfo;
      } else {
        console.warn("⚠️ 切换账号状态失败，后端响应异常:", response);
        return null;
      }
    } catch (error) {
      console.error("❌ 切换账号状态失败:", error);
      return null;
    }
  },  

  /**
   * 刷新账号状态
   */
  async refreshAccountStatus(id: string): Promise<AccountInfo | null> {
    try {
      const response = await api(`/account-management/accounts/${id}/refresh`, {
        method: 'POST'
      });
      return response.data || null;
    } catch (error) {
      console.error('刷新账号状态失败:', error);
      return null;
    }
  },

  /**
   * 更新账号信息（显示名称和描述）
   */
  async updateAccountInfo(id: string, displayName: string, description: string, workspaceId:number, brandId:number): Promise<boolean> {
    try {
      await api(`/account-management/accounts/${id}/info`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName, description, workspaceId, brandId })
      });
      return true;
    } catch (error) {
      console.error('更新账号信息失败:', error);
      return false;
    }
  },

  /**
   * 保存WhatsApp账号到数据库
   */
  async saveWhatsAppAccount(accountData: {
    sessionId: string
    displayName: string
    description: string
    workspaceId: number
    brandId: number
  }):  Promise<{
    ok: boolean
    message: string
    warning?: boolean
    accountInfo?: { displayName: string; phoneNumber: string }
  }> {
    try {
      console.log('📤 发送WhatsApp保存请求:', accountData);
  
      // ✅ Convert to backend expected format
      const payload = {
        sessionId: accountData.sessionId,
        displayName: accountData.displayName,
        description: accountData.description,
        workspaceId: accountData.workspaceId,
        brandId: accountData.brandId,
      };
  
      const response = await api(`/account-management/accounts/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
  
      console.log('📥 WhatsApp保存响应:', response);
      return {
        ok: response?.ok ?? false,
        message: response?.message ?? '未知响应',
        warning: response?.warning ?? false,
        accountInfo: response?.accountInfo ?? undefined,
      };
    } catch (error: any) {
      console.error('❌ 保存WhatsApp账号失败:', error);
      console.error('❌ 错误详情:', {
        message: error?.message,
        status: error?.status,
        response: error?.response?.data,
      });
      throw error;
    }
  },
  
  /**
   * 保存Telegram账号到数据库
   */
  async saveTelegramAccount(accountData: {
    sessionId: string
    displayName: string
    description: string
    workspaceId: number
    brandId: number
  }): Promise<boolean> {
    try {
      console.log('📤 发送Telegram保存请求:', accountData);
  
      // ✅ Ensure backend receives correct camelCase keys
      const payload = {
        sessionId: accountData.sessionId,
        displayName: accountData.displayName,
        description: accountData.description,
        workspaceId: Number(accountData.workspaceId),
        brandId: Number(accountData.brandId),
      };
  
      const response = await api(`/account-management/accounts/telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
  
      console.log('📥 Telegram保存响应:', response);
      return true;
    } catch (error: any) {
      console.error('❌ 保存Telegram账号失败:', error);
      console.error('❌ 错误详情:', {
        message: error?.message,
        status: error?.status,
        response: error?.response?.data,
      });
      throw error;
    }
  }
};
