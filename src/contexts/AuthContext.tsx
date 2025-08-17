import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
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
  account_id: string;
  profile_name: string;
  avatar_url?: string;
  profile_color: string;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  is_active: boolean;
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
  
  // Student profile management
  selectStudentProfile: (profileId: string) => Promise<void>;
  createStudentProfile: (profileName: string, avatarUrl?: string, profileColor?: string) => Promise<{ error: Error | null; newProfile?: StudentProfile }>;
  updateStudentProfile: (profileId: string, updates: Partial<StudentProfile>) => Promise<{ error: Error | null }>;
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
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', userId)
        .single();

      if (accountError) {
        console.error('Error fetching account:', accountError);
        setAccount(null);
        setStudentProfiles(null);
        setActiveStudentProfile(null);
        return;
      }
      setAccount(accountData as AccountProfile);

      // Fetch student profiles for this account
      const { data: studentProfilesData, error: studentProfilesError } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('account_id', userId)
        .eq('is_active', true)
        .order('last_accessed_at', { ascending: false, nullsFirst: false });

      if (studentProfilesError) {
        console.error('Error fetching student profiles:', studentProfilesError);
        setStudentProfiles(null);
        setActiveStudentProfile(null);
        return;
      }
      setStudentProfiles(studentProfilesData as StudentProfile[]);

      // Restore active student profile from localStorage
      const storedActiveProfileId = localStorage.getItem('active_student_profile_id');
      if (storedActiveProfileId) {
        const foundProfile = (studentProfilesData as StudentProfile[]).find(p => p.id === storedActiveProfileId);
        if (foundProfile) {
          setActiveStudentProfile(foundProfile);
          // Update last accessed time
          await supabase.rpc('switch_to_profile', { profile_id: foundProfile.id });
        } else {
          localStorage.removeItem('active_student_profile_id');
          // Auto-select first available profile if stored profile not found
          if (studentProfilesData && studentProfilesData.length > 0) {
            const firstProfile = studentProfilesData[0] as StudentProfile;
            setActiveStudentProfile(firstProfile);
            localStorage.setItem('active_student_profile_id', firstProfile.id);
            // Update last accessed time
            await supabase.rpc('switch_to_profile', { profile_id: firstProfile.id });
          } else {
            setActiveStudentProfile(null);
          }
        }
      } else {
        // Auto-select first available profile if no stored preference
        if (studentProfilesData && studentProfilesData.length > 0) {
          const firstProfile = studentProfilesData[0] as StudentProfile;
          setActiveStudentProfile(firstProfile);
          localStorage.setItem('active_student_profile_id', firstProfile.id);
          // Update last accessed time
          await supabase.rpc('switch_to_profile', { profile_id: firstProfile.id });
        } else {
          setActiveStudentProfile(null);
        }
      }

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
        .from('accounts')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        toast({ title: "Account Update Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles();
      toast({ title: "Account Updated", description: "Your account has been successfully updated." });
      return { error: null };
    } catch (error) {
      const updateError = error as Error;
      toast({ title: "Account Update Error", description: updateError.message, variant: "destructive" });
      return { error: updateError };
    }
  };

  // Select student profile
  const selectStudentProfile = async (profileId: string) => {
    if (!studentProfiles) return;
    
    const selected = studentProfiles.find(p => p.id === profileId);
    if (selected) {
      setActiveStudentProfile(selected);
      localStorage.setItem('active_student_profile_id', selected.id);
      
      // Update last accessed time
      await supabase.rpc('switch_to_profile', { profile_id: profileId });
    }
  };

  // Create student profile
  const createStudentProfile = async (profileName: string, avatarUrl?: string, profileColor?: string) => {
    if (!user) return { error: new Error('No account logged in') };
    
    try {
      const { data, error } = await supabase
        .from('student_profiles')
        .insert({
          account_id: user.id,
          profile_name: profileName,
          avatar_url: avatarUrl,
          profile_color: profileColor || '#3b82f6'
        })
        .select()
        .single();

      if (error) {
        toast({ title: "Profile Creation Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles();
      toast({ title: "Profile Created", description: `${profileName} has been added.` });
      return { error: null, newProfile: data as StudentProfile };
    } catch (error) {
      const createError = error as Error;
      toast({ title: "Profile Creation Error", description: createError.message, variant: "destructive" });
      return { error: createError };
    }
  };

  // Update student profile
  const updateStudentProfile = async (profileId: string, updates: Partial<StudentProfile>) => {
    if (!user) return { error: new Error('No account logged in') };
    
    try {
      const { error } = await supabase
        .from('student_profiles')
        .update(updates)
        .eq('id', profileId)
        .eq('account_id', user.id);

      if (error) {
        toast({ title: "Profile Update Error", description: error.message, variant: "destructive" });
        return { error };
      }

      await refreshAccountAndProfiles();
      toast({ title: "Profile Updated", description: "Student profile updated successfully." });
      return { error: null };
    } catch (error) {
      const updateError = error as Error;
      toast({ title: "Profile Update Error", description: updateError.message, variant: "destructive" });
      return { error: updateError };
    }
  };

  // Delete student profile
  const deleteStudentProfile = async (profileId: string) => {
    if (!user) return { error: new Error('No account logged in') };
    
    try {
      const { error } = await supabase
        .from('student_profiles')
        .update({ is_active: false })
        .eq('id', profileId)
        .eq('account_id', user.id);

      if (error) {
        toast({ title: "Profile Deletion Error", description: error.message, variant: "destructive" });
        return { error };
      }

      // If deleted profile was active, clear it
      if (activeStudentProfile?.id === profileId) {
        setActiveStudentProfile(null);
        localStorage.removeItem('active_student_profile_id');
      }

      await refreshAccountAndProfiles();
      toast({ title: "Profile Deleted", description: "Student profile has been removed." });
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