import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { ChevronDown, User, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ProfileSwitcher: React.FC = () => {
  const { studentProfiles, activeStudentProfile, selectStudentProfile } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  const handleProfileSwitch = async (profileId: string) => {
    if (switching || profileId === activeStudentProfile?.id) return;
    
    setSwitching(true);
    await selectStudentProfile(profileId);
    setSwitching(false);
    
    // Optionally refresh the page or navigate to ensure clean state
    window.location.reload();
  };

  const handleManageProfiles = () => {
    navigate('/profile-selection');
  };

  if (!studentProfiles || studentProfiles.length <= 1) {
    return null; // Don't show switcher if only one profile
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 h-10">
          <Avatar className="h-6 w-6">
            <AvatarFallback 
              className="text-white text-xs font-bold"
              style={{ backgroundColor: activeStudentProfile?.profile_color || '#3b82f6' }}
            >
              {activeStudentProfile?.profile_name?.charAt(0).toUpperCase() || <User className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">
            {activeStudentProfile?.profile_name || 'Select Profile'}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch Profile</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {studentProfiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            onClick={() => handleProfileSwitch(profile.id)}
            className={`cursor-pointer ${profile.id === activeStudentProfile?.id ? 'bg-blue-50' : ''}`}
            disabled={switching}
          >
            <Avatar className="h-6 w-6 mr-2">
              <AvatarFallback 
                className="text-white text-xs font-bold"
                style={{ backgroundColor: profile.profile_color }}
              >
                {profile.profile_name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span>{profile.profile_name}</span>
            {profile.id === activeStudentProfile?.id && (
              <span className="ml-auto text-xs text-blue-600">Current</span>
            )}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleManageProfiles} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          <span>Manage Profiles</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProfileSwitcher;