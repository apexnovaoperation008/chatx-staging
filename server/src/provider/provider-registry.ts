// server/src/providers/provider-registry.ts
import { MessageProvider } from '../types/chat.types';
import { WhatsAppProvider } from './whatsapp-provider';
import { TelegramProvider } from './telegram-provider';


class ProviderRegistry {
  private static providers: Record<string, MessageProvider> = {
    wa: new WhatsAppProvider(),
    tg: new TelegramProvider(),
  };

  static get(platform: string): MessageProvider | undefined {
    if (!this.providers[platform]) {
      this.initializeProvider(platform);
    }
    return this.providers[platform];
  }

  private static initializeProvider(platform: string): void {
    try {
      switch (platform) {
        case 'wa':
          const { WhatsAppProvider } = require('./whatsapp-provider');
          this.providers[platform] = new WhatsAppProvider();
          break;
        case 'tg':
          const { TelegramProvider } = require('./telegram-provider');
          this.providers[platform] = new TelegramProvider();
          break;
        default:
          console.warn(`⚠️ [Provider Registry] 未知的平台: ${platform}`);
      }
    } catch (error: any) {
      console.error(`❌ [Provider Registry] 初始化提供者失败: ${platform}`, error.message);
    }
  }

  static getAll(): Record<string, MessageProvider> {
    return { ...this.providers };
  }

  static register(platform: string, provider: MessageProvider): void {
    this.providers[platform] = provider;
    console.log(`🔧 [Provider Registry] 注册提供者: ${platform}`);
  }

  static getSupportedPlatforms(): string[] {
    return Object.keys(this.providers);
  }
}

export { ProviderRegistry };
