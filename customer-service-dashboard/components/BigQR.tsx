"use client";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function BigQR({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!value || !ref.current) return;
    
    console.log(`🎨 渲染BigQR: ${value.substring(0, 50)}...`);
    
    QRCode.toCanvas(ref.current, value, { 
      errorCorrectionLevel: "L", 
      margin: 3, 
      scale: 6,  // 固定比例，确保清晰度
      width: size,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
      // 不指定version，让qrcode库自动选择最优版本
    })
    .then(() => {
      console.log(`✅ BigQR渲染成功: ${size}x${size}`);
    })
    .catch(err => {
      console.error("❌ BigQR渲染失败:", err);
    });
  }, [value, size]);
  
  return (
    <canvas 
      ref={ref} 
      width={size} 
      height={size} 
      className="border rounded"
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
}
