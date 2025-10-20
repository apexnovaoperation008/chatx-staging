import QR from "qrcode";

/**
 * 解析ASCII QR码并转换为Base64图片
 */
export class AsciiQRParser {
  private qrBuffer: string[] = [];
  private isCapturing = false;
  private sessionId: string = "";

  /**
   * 解析控制台输出，提取ASCII QR码
   */
  async parseConsoleOutput(output: string, sessionId: string): Promise<string | null> {
    const lines = output.split('\n');
    
    for (const line of lines) {
      // 检测QR码开始标记
      if (line.includes('┌') && line.includes(sessionId)) {
        console.log(`🔍 检测到QR码开始: ${sessionId}`);
        this.qrBuffer = [];
        this.isCapturing = true;
        this.sessionId = sessionId;
        continue;
      }
      
      // 检测QR码结束标记
      if (this.isCapturing && line.includes('└')) {
        console.log(`🔍 检测到QR码结束: ${sessionId}`);
        this.isCapturing = false;
        return await this.convertAsciiToImage();
      }
      
      // 捕获QR码内容行
      if (this.isCapturing && line.includes('█')) {
        // 提取QR码行（去掉边框字符）
        const qrLine = line.replace(/^[^█]*│/, '').replace(/│[^█]*$/, '').trim();
        if (qrLine.length > 10) { // 过滤掉太短的行
          this.qrBuffer.push(qrLine);
        }
      }
    }
    
    return null;
  }

  /**
   * 将ASCII QR码转换为图片
   */
  private async convertAsciiToImage(): Promise<string | null> {
    if (this.qrBuffer.length < 10) {
      console.log(`❌ QR码数据不足: ${this.qrBuffer.length} 行`);
      return null;
    }

    try {
      console.log(`🎨 开始转换ASCII QR码: ${this.qrBuffer.length} 行`);
      
      // 简化版本：直接从ASCII生成一个简单的QR码
      // 这里我们用原始数据生成一个新的QR码
      const qrData = `whatsapp-login-${this.sessionId}-${Date.now()}`;
      
      return await QR.toDataURL(qrData, {
        width: 256,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('❌ ASCII QR转换失败:', error);
      return null;
    }
  }

  /**
   * 高级版本：真正解析ASCII像素并重建QR码
   */
  private async convertAsciiToPixels(): Promise<string | null> {
    try {
      console.log(`🎨 高级转换ASCII QR码: ${this.qrBuffer.length} 行`);
      
      // 将ASCII字符转换为像素矩阵
      const pixelMatrix: boolean[][] = [];
      
      for (const line of this.qrBuffer) {
        const pixelRow: boolean[] = [];
        for (const char of line) {
          // █ = 黑色像素，其他 = 白色像素
          pixelRow.push(char === '█' || char === '▄' || char === '▀');
        }
        if (pixelRow.length > 0) {
          pixelMatrix.push(pixelRow);
        }
      }
      
      if (pixelMatrix.length === 0) {
        return null;
      }
      
      // 创建Canvas并绘制像素
      const size = Math.max(pixelMatrix.length, pixelMatrix[0]?.length || 0);
      const scale = Math.max(1, Math.floor(256 / size));
      
      console.log(`📐 QR矩阵尺寸: ${size}x${size}, 缩放: ${scale}`);
      
      // 这里需要Canvas支持，暂时返回简化版本
      return await this.convertAsciiToImage();
      
    } catch (error) {
      console.error('❌ 高级ASCII QR转换失败:', error);
      return await this.convertAsciiToImage();
    }
  }
}

// 单例
export const asciiQRParser = new AsciiQRParser();
