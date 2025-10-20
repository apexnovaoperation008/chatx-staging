import React from 'react';

interface AvatarWithFallbackProps {
  src?: string;
  name: string;
  className?: string;
  size?: number;
}

// 生成默认头像的函数
function generateDefaultAvatar(name: string, size: number = 40): string {
  // 获取名字的第一个字符，如果是中文则取第一个字符，如果是英文则取前两个字符
  const firstChar = name.charAt(0);
  const isChinese = /[\u4e00-\u9fa5]/.test(firstChar);
  const avatarText = isChinese ? firstChar : name.substring(0, 2).toUpperCase();
  
  // 生成随机背景色
  const colors = [
    'FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 
    'DDA0DD', '98D8C8', 'F7DC6F', 'BB8FCE', '85C1E9'
  ];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarText)}&size=${size}&background=${randomColor}&color=fff&bold=true`;
}

export const AvatarWithFallback: React.FC<AvatarWithFallbackProps> = ({ 
  src, 
  name, 
  className = "w-8 h-8 rounded-full",
  size = 40
}) => {
  const [imgSrc, setImgSrc] = React.useState(src || generateDefaultAvatar(name, size));
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setImgSrc(src || generateDefaultAvatar(name, size));
    setHasError(false);
  }, [src, name, size]);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      setImgSrc(generateDefaultAvatar(name, size));
    }
  };

  return (
    <img
      src={imgSrc}
      alt={name}
      className={className}
      onError={handleError}
    />
  );
};


