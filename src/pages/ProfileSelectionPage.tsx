import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Plus, Settings, LogOut, User as UserIcon, Palette } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const PROFILE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

const ProfileSelectionPage: React.FC = () => {
  const { 
    user, 
    account, 
    studentProfiles, 
    activeStudentProfile, 
    loading, 
    selectStudentProfile, 
    createStudentProfile, 
    updateStudentProfile, 
    deleteStudentProfile, 
    signOut 
  } = useAuth();
  const navigate = useNavigate();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState(PROFILE_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const [showManageDialog, setShowManageDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any | null>(null);
  const [editedProfileName, setEditedProfileName] = useState('');
  const [editedProfileColor, setEditedProfileColor] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Redirect if already has active profile
  useEffect(() => {
    if (user && activeStudentProfile && !loading && !showCreateDialog && !showManageDialog && !editingProfile) {
      navigate('/home', { replace: true });
    }
  }, [user, activeStudentProfile, loading, navigate, showCreateDialog, showManageDialog, editingProfile]);

  const handleProfileSelect = async (profileId: string) => {
    if (loading) return;
    await selectStudentProfile(profileId);
    navigate('/home');
  };

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) {
      toast({ title: "Error", description: "Profile name cannot be empty.", variant: "destructive" });
      return;
    }
    
    setIsCreating(true);
    const { error } = await createStudentProfile(newProfileName.trim(), undefined, newProfileColor);
    setIsCreating(false);
    
    if (!error) {
      setNewProfileName('');
      setNewProfileColor(PROFILE_COLORS[0]);
      setShowCreateDialog(false);
    }
  };

  const handleEditProfile = (profile: any) => {
    setEditingProfile(profile);
    setEditedProfileName(profile.profile_name);
    setEditedProfileColor(profile.profile_color || PROFILE_COLORS[0]);
    setShowManageDialog(false);
  };

  const handleUpdateProfile = async () => {
    if (!editingProfile || !editedProfileName.trim()) {
      toast({ title: "Error", description: "Profile name cannot be empty.", variant: "destructive" });
      return;
    }
    
    setIsUpdating(true);
    const { error } = await updateStudentProfile(editingProfile.id, { 
      profile_name: editedProfileName.trim(),
      profile_color: editedProfileColor
    });
    setIsUpdating(false);
    
    if (!error) {
      setEditingProfile(null);
      setShowManageDialog(true);
    }
  };

  const handleDeleteProfile = async (profile: any) => {
    if (!confirm(`Are you sure you want to delete ${profile.profile_name}? This action cannot be undone.`)) {
      return;
    }
    
    setIsDeleting(true);
    const { error } = await deleteStudentProfile(profile.id);
    setIsDeleting(false);
    
    if (!error) {
      // Don't close the manage dialog, just refresh the list
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading profiles...</p>
        </div>
      </div>
    );
  }

  if (!user || !account) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-gradient-clip mb-2">
            Who's learning today?
          </CardTitle>
          <p className="text-gray-600">Select a profile to continue</p>
          <p className="text-sm text-gray-500">Account: {account.email}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {studentProfiles?.map((profile) => (
              <Button
                key={profile.id}
                variant="outline"
                className="flex flex-col items-center justify-center h-32 w-full p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-2 hover:border-blue-300"
                onClick={() => handleProfileSelect(profile.id)}
              >
                <Avatar className="h-16 w-16 mb-3">
                  <AvatarFallback 
                    className="text-white text-xl font-bold"
                    style={{ backgroundColor: profile.profile_color }}
                  >
                    {profile.profile_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-center truncate w-full">
                  {profile.profile_name}
                </span>
              </Button>
            ))}
            
            {/* Add New Profile Button */}
            <Button
              variant="outline"
              className="flex flex-col items-center justify-center h-32 w-full p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-8 w-8 mb-3" />
              <span className="text-sm font-medium">Add New</span>
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setShowManageDialog(true)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Manage Profiles
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Profile Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Student Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newProfileName">Profile Name</Label>
              <Input
                id="newProfileName"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., Sarah, Tom, Alex"
                disabled={isCreating}
                maxLength={50}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Profile Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PROFILE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newProfileColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewProfileColor(color)}
                    disabled={isCreating}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateDialog(false)} 
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProfile} 
              disabled={isCreating || !newProfileName.trim()}
              className="bg-gradient-orange-magenta hover:bg-gradient-orange-magenta text-white"
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Profiles Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Student Profiles</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-96 overflow-y-auto">
            {studentProfiles?.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback 
                      className="text-white font-bold"
                      style={{ backgroundColor: profile.profile_color }}
                    >
                      {profile.profile_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{profile.profile_name}</p>
                    <p className="text-sm text-gray-500">
                      {profile.last_accessed_at 
                        ? `Last used: ${new Date(profile.last_accessed_at).toLocaleDateString()}`
                        : 'Never used'
                      }
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleEditProfile(profile)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => handleDeleteProfile(profile)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editingProfile} onOpenChange={() => setEditingProfile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editedProfileName">Profile Name</Label>
              <Input
                id="editedProfileName"
                value={editedProfileName}
                onChange={(e) => setEditedProfileName(e.target.value)}
                placeholder="Profile Name"
                disabled={isUpdating}
                maxLength={50}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Profile Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PROFILE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      editedProfileColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEditedProfileColor(color)}
                    disabled={isUpdating}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditingProfile(null)} 
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateProfile} 
              disabled={isUpdating || !editedProfileName.trim()}
              className="bg-gradient-orange-magenta hover:bg-gradient-orange-magenta text-white"
            >
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfileSelectionPage;