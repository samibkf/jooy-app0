import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import ProfileSwitcher from '@/components/ProfileSwitcher';
import StudentProfileIndicator from '@/components/StudentProfileIndicator';

interface AppHeaderProps {
  title?: string;
  showProfileSwitcher?: boolean;
  className?: string;
}

const AppHeader: React.FC<AppHeaderProps> = ({ 
  title, 
  showProfileSwitcher = true,
  className = ''
}) => {
  const { account, activeStudentProfile } = useAuth();

  return (
    <header className={`bg-white border-b border-gray-200 px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          {title && (
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          )}
          {showProfileSwitcher && <ProfileSwitcher />}
        </div>
        
        <div className="flex items-center gap-4">
          {activeStudentProfile && (
            <StudentProfileIndicator size="sm" />
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default AppHeader;