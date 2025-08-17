// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';

// Define types for the context
interface AuthContextType {
  user: User | null;
  account: AccountProfile | null;
  studentProfiles: StudentProfile[] | null;
  activeStudentProfile: StudentProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshAccountAndProfiles: () => Promise<void>;
  switchStudentProfile: (profileId: string) => Promise<void>;
  createStudentProfile: (profileName: string, profileColor: string) => Promise<void>;
  updateStudentProfile: (profileId: string, updates: Partial<StudentProfile>) => Promise<void>;
  deleteStudentProfile: (profileId: string) => Promise<void>;
}

interface AccountProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'admin' | 'student';
  created_at: string;
  plan_id: string | null;
  credits_remaining: number;
  onboarding_completed: boolean;
  updated_at: string;
  preferences: AccountPreferences | null;
}

interface StudentProfile {
  id: string;
  profile_name: string;
  profile_color: string;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface AccountPreferences {
  activeProfileId?: string;
  studentProfiles?: StudentProfile[];
  [key: string]: any;
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ... (rest of your imports and interfaces)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [studentProfiles, setStudentProfiles] = useState<StudentProfile[] | null>(null);
  const [activeStudentProfile, setActiveStudentProfile] = useState<StudentProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch account and student profiles
  const fetchAccountAndProfiles = async (userId: string) => {
    console.log('AuthContext: fetchAccountAndProfiles started for userId:', userId);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('AuthContext: Error fetching profile:', profileError);
        setAccount(null);
        setStudentProfiles(null);
        setActiveStudentProfile(null);
        return;
      }
      console.log('AuthContext: Profile data fetched:', profileData);
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
      console.log('AuthContext: fetchAccountAndProfiles completed successfully.');

    } catch (error) {
      console.error('AuthContext: Error in fetchAccountAndProfiles catch block:', error);
      setAccount(null);
      setStudentProfiles(null);
      setActiveStudentProfile(null);
    }
  };

  // Refresh account and profiles data
  const refreshAccountAndProfiles = async () => {
    if (user) {
      console.log('AuthContext: refreshAccountAndProfiles called.');
      await fetchAccountAndProfiles(user.id);
    } else {
      console.log('AuthContext: refreshAccountAndProfiles called, but no user.');
      setAccount(null);
      setStudentProfiles(null);
      setActiveStudentProfile(null);
    }
  };

  // Sign in function
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  // Sign up function
  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  // Sign out function
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Switch student profile function
  const switchStudentProfile = async (profileId: string) => {
    if (!user || !account || !studentProfiles) return;

    const targetProfile = studentProfiles.find(p => p.id === profileId);
    if (!targetProfile) return;

    const updatedPreferences = {
      ...account.preferences,
      activeProfileId: profileId,
    };

    const { error } = await supabase
      .from('profiles')
      .update({ preferences: updatedPreferences })
      .eq('id', user.id);

    if (!error) {
      setActiveStudentProfile(targetProfile);
      setAccount({ ...account, preferences: updatedPreferences });
    }
  };

  // Create student profile function
  const createStudentProfile = async (profileName: string, profileColor: string) => {
    if (!user || !account) return;

    const newProfile: StudentProfile = {
      id: uuidv4(),
      profile_name: profileName,
      profile_color: profileColor,
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: false,
    };

    const updatedProfiles = [...(studentProfiles || []), newProfile];
    const updatedPreferences = {
      ...account.preferences,
      studentProfiles: updatedProfiles,
    };

    const { error } = await supabase
      .from('profiles')
      .update({ preferences: updatedPreferences })
      .eq('id', user.id);

    if (!error) {
      setStudentProfiles(updatedProfiles);
      setAccount({ ...account, preferences: updatedPreferences });
      toast({
        title: "Profile Created",
        description: `Student profile "${profileName}" has been created successfully.`,
      });
    }
  };

  // Update student profile function
  const updateStudentProfile = async (profileId: string, updates: Partial<StudentProfile>) => {
    if (!user || !account || !studentProfiles) return;

    const updatedProfiles = studentProfiles.map(profile =>
      profile.id === profileId
        ? { ...profile, ...updates, updated_at: new Date().toISOString() }
        : profile
    );

    const updatedPreferences = {
      ...account.preferences,
      studentProfiles: updatedProfiles,
    };

    const { error } = await supabase
      .from('profiles')
      .update({ preferences: updatedPreferences })
      .eq('id', user.id);

    if (!error) {
      setStudentProfiles(updatedProfiles);
      setAccount({ ...account, preferences: updatedPreferences });
      
      // Update active profile if it's the one being updated
      if (activeStudentProfile?.id === profileId) {
        setActiveStudentProfile({ ...activeStudentProfile, ...updates, updated_at: new Date().toISOString() });
      }
    }
  };

  // Delete student profile function
  const deleteStudentProfile = async (profileId: string) => {
    if (!user || !account || !studentProfiles) return;

    const updatedProfiles = studentProfiles.filter(profile => profile.id !== profileId);
    
    // If deleting the active profile, switch to the first remaining profile
    let newActiveProfileId = account.preferences?.activeProfileId;
    if (activeStudentProfile?.id === profileId && updatedProfiles.length > 0) {
      newActiveProfileId = updatedProfiles[0].id;
    }

    const updatedPreferences = {
      ...account.preferences,
      studentProfiles: updatedProfiles,
      activeProfileId: newActiveProfileId,
    };

    const { error } = await supabase
      .from('profiles')
      .update({ preferences: updatedPreferences })
      .eq('id', user.id);

    if (!error) {
      setStudentProfiles(updatedProfiles);
      setAccount({ ...account, preferences: updatedPreferences });
      
      // Update active profile if needed
      if (activeStudentProfile?.id === profileId) {
        setActiveStudentProfile(updatedProfiles.length > 0 ? updatedProfiles[0] : null);
      }
    }
  };

  // Initialize auth state
  useEffect(() => {
    console.log('AuthContext: useEffect mounted, initial loading set to true.');
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('AuthContext: getSession resolved, session:', session);
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchAccountAndProfiles(session.user.id).finally(() => {
          console.log('AuthContext: fetchAccountAndProfiles finally block, setting loading to false.');
          setLoading(false);
        });
      } else {
        console.log('AuthContext: No user session, setting loading to false.');
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthContext: Auth state changed event:', event, 'session:', session);
        
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
        console.log('AuthContext: onAuthStateChange completed, setting loading to false.');
        setLoading(false);
      }
    );

    return () => {
      console.log('AuthContext: useEffect cleanup, unsubscribing from auth changes.');
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // ... (rest of your AuthProvider code)

  const value: AuthContextType = {
    user,
    account,
    studentProfiles,
    activeStudentProfile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshAccountAndProfiles,
    switchStudentProfile,
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

// Export the useAuth hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};