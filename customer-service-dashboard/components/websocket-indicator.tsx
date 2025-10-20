'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { websocketClient } from '@/lib/websocket-client';

interface WebSocketIndicatorProps {
  showDetails?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export default function WebSocketIndicator({ 
  showDetails = false, 
  position = 'bottom-right' 
}: WebSocketIndicatorProps) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [messageCount, setMessageCount] = React.useState(0);

  React.useEffect(() => {
    const checkConnection = () => {
      const status = websocketClient.getConnectionStatus();
      setIsConnected(status.isConnected);
    };

    // 监听 WebSocket 状态变化事件
    const handleStatusChange = (event: CustomEvent) => {
      const status = event.detail;
      setIsConnected(status.isConnected);
    };

    // 初始检查
    checkConnection();
    
    // 定期检查连接状态（作为备用）
    const interval = setInterval(checkConnection, 5000);

    // 监听 WebSocket 状态变化事件
    window.addEventListener('chatx:websocketStatusChange', handleStatusChange as EventListener);

    // 监听消息
    const handleMessage = (data: any) => {
      setMessageCount(prev => prev + 1);
    };

    websocketClient.onNewMessage(handleMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('chatx:websocketStatusChange', handleStatusChange as EventListener);
      websocketClient.offNewMessage(handleMessage);
    };
  }, []);

  const handleReconnect = () => {
    websocketClient.connect();
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-right': return 'top-4 right-4';
      case 'top-left': return 'top-4 left-4';
      case 'bottom-right': return 'bottom-4 right-4';
      case 'bottom-left': return 'bottom-4 left-4';
      default: return 'bottom-4 right-4';
    }
  };

  if (!showDetails) {
    return (
      <div className={`fixed ${getPositionClasses()} z-50`}>
        <div 
          className={`w-3 h-3 rounded-full cursor-pointer transition-all duration-200 ${
            isConnected ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
          }`}
          onClick={handleReconnect}
          title={isConnected ? 'WebSocket 已连接' : 'WebSocket 断开 - 点击重连'}
        />
      </div>
    );
  }

  return (
    <div className={`fixed ${getPositionClasses()} z-50`}>
      <div className="bg-white dark:bg-gray-800 border rounded-lg shadow-lg p-2 min-w-[120px]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-medium">WS</span>
          </div>
          <span className="text-xs text-gray-500">
            {messageCount}
          </span>
        </div>
        
        <div className="text-xs text-gray-500 mb-1">
          {isConnected ? '已连接' : '断开'}
        </div>
        
        {!isConnected && (
          <button 
            onClick={handleReconnect}
            className="w-full text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            重连
          </button>
        )}
      </div>
    </div>
  );
}
