import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface StudentProfileIndicatorProps {
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const StudentProfileIndicator: React.FC<StudentProfileIndicatorProps> = ({ 
  showName = true, 
  size = 'md',
  className = ''
}) => {
  const { activeStudentProfile } = useAuth();

  if (!activeStudentProfile) {
    return null;
  }

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Avatar className={sizeClasses[size]}>
        <AvatarFallback 
          className="text-white font-bold"
          style={{ backgroundColor: activeStudentProfile.profile_color }}
        >
          {activeStudentProfile.profile_name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {showName && (
        <span className={`font-medium text-gray-700 ${textSizeClasses[size]}`}>
          {activeStudentProfile.profile_name}
        </span>
      )}
    </div>
  );
};

export default StudentProfileIndicator;