import React from 'react';

interface StatusIndicatorProps {
  status: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ 
  status, 
  className = "w-2 h-2 rounded-full" 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
      case "connected":
        return "bg-green-500";
      case "away":
        return "bg-yellow-500";
      case "offline":
      case "disconnected":
        return "bg-gray-400";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className={`${getStatusColor(status)} ${className}`} />
  );
};


