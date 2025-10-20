import React from 'react';

interface PlatformIconProps {
  platform: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({ 
  platform, 
  size = 'md', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const sizeClass = sizeClasses[size];

  if (platform === "whatsapp") {
    return (
      <img
        src="/logos/WhatsApp.svg"
        alt="WhatsApp"
        className={`${sizeClass} object-contain ${className}`}
      />
    );
  }
  
  return (
    <img
      src="/logos/Telegram.svg"
      alt="Telegram"
      className={`${sizeClass} object-contain ${className}`}
    />
  );
};


