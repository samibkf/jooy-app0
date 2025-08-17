import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';

interface AccountProfile {
  id: string;
  email: string;
  full_name?: string;
  role: 'user' | 'admin' | 'student';
  plan_id?: string;
  credits_remaining: number;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

interface StudentProfile {
  id: string;
  profile_name: string;
  avatar_url?: string;
  profile_color: string;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  is_active: boolean;
}

interface AccountPreferences {
  activeProfileId?: string;
  studentProfiles: StudentProfile[];
}

interface AuthContextType {
  user: User | null;
  account: AccountProfile | null;
  studentProfiles: StudentProfile[] | null;
  activeStudentProfile: StudentProfile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string, initialProfileName?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updateAccount: (updates: Partial<AccountProfile>) => Promise<{ error: Error | null }>;
  refreshAccountAndProfiles: () => Promise<void>;
  
  // Student profile management (now fully implemented)
  selectStudentProfile: (profileId: string) => Promise<{ error: Error | null }>;
  createStudentProfile: (profileName: string, profileColor?: string) => Promise<{ error: Error | null; newProfile?: StudentProfile }>;
  updateStudentProfile: (profileId: string, updates: Partial<Omit<StudentProfile, 'id' | 'created_at' | 'updated_at' | 'preferences' | 'is_active'>>) => Promise<{ error: Error | null }>;
  deleteStudentProfile: (profileId: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [studentProfiles, setStudentProfiles] = useState<StudentProfile[] | null>(null);
  const [activeStudentProfile, setActiveStudentProfile] = useState<StudentProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch account and student profiles
  const fetchAccountAndProfiles = async (userId: string) => {
    try {
      // Fetch account data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setAccount(null);
        setStudentProfiles(null);
        setActiveStudentProfile(null);
        return;
      }
      setAccount(profileData as AccountProfile);

      // Handle student profiles stored in preferences
      let currentStudentProfiles: StudentProfile[] = [];
      let currentActiveStudentProfile: StudentProfile | null = null;
      const userPreferences = profileData.preferences as AccountPreferences | null;

      if (userPreferences && Array.isArray(userPreferences.studentProfiles) && userPreferences.studentProfiles.length > 0) {
        currentStudentProfiles = userPreferences.studentProfiles;
        
        // Try to find the active profile
        if (userPreferences.activeProfileId) {
          currentActiveStudentProfile = currentStudentProfiles.find(p => p.id === userPreferences.activeProfileId) || null;
        }
        
        // If no active profile found or activeProfileId is missing, default to the first one
        if (!currentActiveStudentProfile) {
          currentActiveStudentProfile = currentStudentProfiles[0];
          // Update preferences to set this as active
          await supabase
            .from('profiles')
            .update({ preferences: { ...userPreferences, activeProfileId: currentActiveStudentProfile.id } })
            .eq('id', userId);
        }
      } else {
        // If no student profiles exist, create a default one
        const defaultProfile: StudentProfile = {
          id: uuidv4(),
          profile_name: profileData.full_name?.split(' ')[0] || 'Student',
          profile_color: '#3b82f6', // Default color
          preferences: {}, // Empty preferences for student profile
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true,
        };
        currentStudentProfiles = [defaultProfile];
        currentActiveStudentProfile = defaultProfile;
        
        await supabase
          .from('profiles')
          .update({ preferences: { activeProfileId: defaultProfile.id, studentProfiles: currentStudentProfiles } })
          .eq('id', userId);
      }
      setStudentProfiles(currentStudentProfiles);
      setActiveStudentProfile(currentActiveStudentProfile);

    } catch (error) {
      console.error('Error in fetchAccountAndProfiles:', error);
      setAccount(null);
      setStudentProfiles(null);
      setActiveStudentProfile(null);
    }
  };

  // Refresh account and profiles data
  const refreshAccountAndProfiles = async () => {
    if (user) {
      await fetchAccountAndProfiles(user.id);
    } else {
      setAccount(null);
      setStudentProfiles(null);
      setActiveStudentProfile(null);
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchAccountAndProfiles(session.user.id).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchAccountAndProfiles(session.user.id);
        } else {
          setAccount(null);
          setStudentProfiles(null);
          setActiveStudentProfile(null);
          localStorage.removeItem('active_student_profile_id');
        }
        
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Sign up function
  const signUp = async (email: string, password: string, fullName?: string, initialProfileName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || '',
            initial_profile_name: initialProfileName || 'Student 1',
          }
        }
      });

      if (error) {
        toast({
          title: "Sign Up Error",
          description: error.message,
          variant: "destructive"
        });
        return { error };
      }

      if (data.user && !data.session) {
        toast({
          title: "Check Your Email",
          description: "Please check your email for a confirmation link to complete your registration.",
        });
      }

      // If user is immediately signed in, the trigger will create the default profile
      if (data.user && data.session) {
        // Refresh to get the newly created profile
        setTimeout(() => {
          fetchAccountAndProfiles(data.user.id);
        }, 1000);
      }
      
      // If user is created but not immediately signed in (e.g., email confirmation required),
      // ensure a default profile is set up for when they do sign in.
      // This is handled by fetchAccountAndProfiles when they eventually log in.
      // However, if we want to ensure it's there immediately for some flows,
      // we might need a server-side function or a more complex client-side setup.
      // For now, relying on fetchAccountAndProfiles on login/session change is sufficient.


      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      toast({
        title: "Sign Up Error",
        description: authError.message,
        variant: "destructive"
      });
      return { error: authError };
    }
  };

  // Sign in function
  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Sign In Error",
          description: error.message,
          variant: "destructive"
        });
        return { error };
      }

      toast({
        title: "Welcome Back!",
        description: "You have successfully signed in.",
      });

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      toast({
        title: "Sign In Error",
        description: authError.message,
        variant: "destructive"
      });
      return { error: authError };
    }
  };

  // Google Sign-In function
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/profile-selection`,
        },
      });

      if (error) {
        toast({
          title: "Google Sign-In Error",
          description: error.message,
          variant: "destructive"
        });
        return { error };
      }

      // Supabase handles the redirection, so no further client-side navigation needed here
      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      toast({
        title: "Google Sign-In Error",
        description: authError.message,
        variant: "destructive"
      });
      return { error: authError };
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        toast({
          title: "Sign Out Error",
          description: error.message,
          variant: "destructive"
        });
        return { error };
      }

      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      toast({
        title: "Sign Out Error",
        description: authError.message,
        variant: "destructive"
      });
      return { error: authError };
    }
  };

  // Reset password function
  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: "Password Reset Error",
          description: error.message,
          variant: "destructive"
        });
        return { error };
      }

      toast({
        title: "Password Reset Email Sent",
        description: "Please check your email for password reset instructions.",
      });

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      toast({
        title: "Password Reset Error",
        description: authError.message,
        variant: "destructive"
      });
      return { error: authError };
    }
  };

  // Update account function
  const updateAccount = async (updates: Partial<AccountProfile>) => {
    if (!user) {
      return { error: new Error('No user logged in') };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        toast({ title: "Profile Update Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles();
      toast({ title: "Profile Updated", description: "Your profile has been successfully updated." });
      return { error: null };
    } catch (error) {
      const updateError = error as Error;
      toast({ title: "Profile Update Error", description: updateError.message, variant: "destructive" });
      return { error: updateError };
    }
  };

  // Select student profile
  const selectStudentProfile = async (profileId: string) => {
    if (!user || !account || !studentProfiles) {
      return { error: new Error('User not logged in or profiles not loaded.') };
    }

    const selectedProfile = studentProfiles.find(p => p.id === profileId);
    if (!selectedProfile) {
      return { error: new Error('Selected profile not found.') };
    }

    try {
      const updatedStudentProfiles = studentProfiles.map(p => 
        p.id === profileId ? { ...p, last_accessed_at: new Date().toISOString() } : p
      );

      const newPreferences: AccountPreferences = {
        activeProfileId: profileId,
        studentProfiles: updatedStudentProfiles,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ preferences: newPreferences })
        .eq('id', user.id);

      if (error) {
        toast({ title: "Profile Selection Error", description: error.message, variant: "destructive" });
        return { error };
      }

      // Update local state immediately for responsiveness
      setStudentProfiles(updatedStudentProfiles);
      setActiveStudentProfile(selectedProfile);
      
      toast({ title: "Profile Switched", description: `Switched to ${selectedProfile.profile_name}.` });
      return { error: null };
    } catch (error) {
      const selectError = error as Error;
      toast({ title: "Profile Selection Error", description: selectError.message, variant: "destructive" });
      return { error: selectError };
    }
  };

  // Create student profile
  const createStudentProfile = async (profileName: string, profileColor?: string) => {
    if (!user || !account) {
      return { error: new Error('User not logged in.') };
    }

    try {
      const newProfile: StudentProfile = {
        id: uuidv4(),
        profile_name: profileName,
        profile_color: profileColor || '#3b82f6', // Default color if not provided
        preferences: {}, // Student profile specific preferences
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true, // New profiles are active by default
      };

      const currentPreferences = (account.preferences || {}) as AccountPreferences;
      const updatedStudentProfiles = [...(currentPreferences.studentProfiles || []), newProfile];

      const newPreferences: AccountPreferences = {
        activeProfileId: newProfile.id, // Set new profile as active
        studentProfiles: updatedStudentProfiles,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ preferences: newPreferences })
        .eq('id', user.id);

      if (error) {
        toast({ title: "Profile Creation Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles(); // Refresh context state
      toast({ title: "Profile Created", description: `${profileName} has been added.` });
      return { error: null, newProfile };
    } catch (error) {
      const createError = error as Error;
      toast({ title: "Profile Creation Error", description: createError.message, variant: "destructive" });
      return { error: createError };
    }
  };

  // Update student profile
  const updateStudentProfile = async (profileId: string, updates: Partial<Omit<StudentProfile, 'id' | 'created_at' | 'updated_at' | 'preferences' | 'is_active'>>) => {
    if (!user || !account || !studentProfiles) {
      return { error: new Error('User not logged in or profiles not loaded.') };
    }

    try {
      const updatedStudentProfiles = studentProfiles.map(p => 
        p.id === profileId ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
      );

      const currentPreferences = (account.preferences || {}) as AccountPreferences;
      const newPreferences: AccountPreferences = {
        ...currentPreferences,
        studentProfiles: updatedStudentProfiles,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ preferences: newPreferences })
        .eq('id', user.id);

      if (error) {
        toast({ title: "Profile Update Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles(); // Refresh context state
      toast({ title: "Profile Updated", description: "Profile has been updated." });
      return { error: null };
    } catch (error) {
      const updateError = error as Error;
      toast({ title: "Profile Update Error", description: updateError.message, variant: "destructive" });
      return { error: updateError };
    }
  };

  // Delete student profile
  const deleteStudentProfile = async (profileId: string) => {
    if (!user || !account || !studentProfiles) {
      return { error: new Error('User not logged in or profiles not loaded.') };
    }

    if (studentProfiles.length <= 1) {
      toast({ title: "Deletion Error", description: "Cannot delete the last profile.", variant: "destructive" });
      return { error: new Error('Cannot delete the last profile.') };
    }

    try {
      const updatedStudentProfiles = studentProfiles.filter(p => p.id !== profileId);
      let newActiveProfileId = account.preferences?.activeProfileId;

      // If the deleted profile was active, set another one as active
      if (newActiveProfileId === profileId) {
        newActiveProfileId = updatedStudentProfiles[0]?.id || undefined;
      }

      const newPreferences: AccountPreferences = {
        activeProfileId: newActiveProfileId,
        studentProfiles: updatedStudentProfiles,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ preferences: newPreferences })
        .eq('id', user.id);

      if (error) {
        toast({ title: "Profile Deletion Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles(); // Refresh context state
      toast({ title: "Profile Deleted", description: "Profile has been deleted." });
      return { error: null };
    } catch (error) {
      const deleteError = error as Error;
      toast({ title: "Profile Deletion Error", description: deleteError.message, variant: "destructive" });
      return { error: deleteError };
    }
  };

  const value: AuthContextType = {
    user,
    account,
    studentProfiles,
    activeStudentProfile,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updateAccount,
    refreshAccountAndProfiles,
    selectStudentProfile,
    createStudentProfile,
    updateStudentProfile,
    deleteStudentProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};