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

      // For now, since we don't have student_profiles table, set a mock active profile
      // This allows the user to proceed to the home page
      setStudentProfiles([]);
      setActiveStudentProfile({
        id: userId,
        account_id: userId,
        profile_name: profileData.full_name || 'Default Profile',
        profile_color: '#3b82f6',
        preferences: {},
        created_at: profileData.created_at,
        updated_at: profileData.updated_at,
        is_active: true
      } as StudentProfile);

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
    // Since we're using a mock profile system for now, just navigate
    return;
  };

  // Create student profile
  const createStudentProfile = async (profileName: string, avatarUrl?: string, profileColor?: string) => {
    if (!user) return { error: new Error('No user logged in') };
    
    // Mock implementation for now
    toast({ title: "Feature Not Available", description: "Student profile creation is not yet implemented.", variant: "destructive" });
    return { error: new Error('Feature not implemented') };
  };

  // Update student profile
  const updateStudentProfile = async (profileId: string, updates: Partial<StudentProfile>) => {
    if (!user) return { error: new Error('No user logged in') };
    
    // Mock implementation for now
    toast({ title: "Feature Not Available", description: "Student profile editing is not yet implemented.", variant: "destructive" });
    return { error: new Error('Feature not implemented') };
  };

  // Delete student profile
  const deleteStudentProfile = async (profileId: string) => {
    if (!user) return { error: new Error('No user logged in') };
    
    // Mock implementation for now
    toast({ title: "Feature Not Available", description: "Student profile deletion is not yet implemented.", variant: "destructive" });
    return { error: new Error('Feature not implemented') };
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