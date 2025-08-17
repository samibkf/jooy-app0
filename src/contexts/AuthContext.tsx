// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isSupabaseReady } from '@/lib/supabase';
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
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updateAccount: (updates: Partial<AccountProfile>) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshAccountAndProfiles: () => Promise<void>;
  selectStudentProfile: (profileId: string) => Promise<void>;
  createStudentProfile: (profileName: string, profileColor?: string) => Promise<{ error: AuthError | null }>;
  updateStudentProfile: (profileId: string, updates: Partial<StudentProfile>) => Promise<{ error: AuthError | null }>;
  deleteStudentProfile: (profileId: string) => Promise<{ error: AuthError | null }>;
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
    
    // Check if Supabase is configured
    if (!isSupabaseReady) {
      console.log('AuthContext: Supabase not configured, creating mock profile');
      
      // Create a mock profile for development
      const mockProfile: AccountProfile = {
        id: userId,
        email: 'mock@example.com',
        full_name: 'Mock User',
        role: 'user',
        created_at: new Date().toISOString(),
        plan_id: null,
        credits_remaining: 100,
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
        preferences: null
      };
      
      const mockStudentProfile: StudentProfile = {
        id: uuidv4(),
        profile_name: 'Student',
        profile_color: '#3b82f6',
        preferences: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
      };
      
      setAccount(mockProfile);
      setStudentProfiles([mockStudentProfile]);
      setActiveStudentProfile(mockStudentProfile);
      console.log('AuthContext: Mock profile setup completed');
      return;
    }
    
    try {
      console.log('AuthContext: Attempting to fetch profile from Supabase...');
      
      // Create a more aggressive timeout wrapper
      const fetchWithTimeout = async () => {
        return new Promise(async (resolve, reject) => {
          // Set a 30-second timeout for better user experience
          const timeoutId = setTimeout(() => {
            console.log('AuthContext: Query timed out after 30 seconds');
            reject(new Error('Query timeout after 30 seconds'));
          }, 30000);
          
          try {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
            
            clearTimeout(timeoutId);
            resolve({ data: profileData, error: profileError });
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });
      };

      const { data: profileData, error: profileError } = await fetchWithTimeout() as any;

      console.log('AuthContext: Supabase query completed. Error:', profileError, 'Data:', profileData);

      if (profileError) {
        console.error('AuthContext: Error fetching profile:', profileError);
        
        // Handle timeout errors
        if (profileError.message?.includes('timeout')) {
          console.error('AuthContext: Query timed out, falling back to mock profile');
          // Create a temporary profile to prevent app hanging
          const tempProfile: AccountProfile = {
            id: userId,
            email: user?.email || 'user@example.com',
            full_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'User',
            role: 'user',
            created_at: new Date().toISOString(),
            plan_id: null,
            credits_remaining: 100,
            onboarding_completed: false,
            updated_at: new Date().toISOString(),
            preferences: null
          };
          
          const tempStudentProfile: StudentProfile = {
            id: uuidv4(),
            profile_name: tempProfile.full_name?.split(' ')[0] || 'Student',
            profile_color: '#3b82f6',
            preferences: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
          };
          
          setAccount(tempProfile);
          setStudentProfiles([tempStudentProfile]);
          setActiveStudentProfile(tempStudentProfile);
          console.log('AuthContext: Temporary profile setup completed due to timeout');
          return;
        }
        
        // If profile doesn't exist, this might be a new user - try to create one
        if (profileError.code === 'PGRST116') {
          console.log('AuthContext: Profile not found, attempting to create new profile...');
          
          // Get user data from auth
          const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
          
          if (userError) {
            console.error('AuthContext: Error getting user data:', userError);
            setAccount(null);
            setStudentProfiles(null);
            setActiveStudentProfile(null);
            return;
          }
          
          if (authUser) {
            const newProfileData = {
              id: userId,
              email: authUser.email || '',
              full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
              role: 'user' as const,
              credits_remaining: 100,
              onboarding_completed: false,
              preferences: null
            };
            
            console.log('AuthContext: Creating new profile with data:', newProfileData);
            
            try {
              const createProfilePromise = supabase
                .from('profiles')
                .insert(newProfileData)
                .select()
                .single();
              
              const createTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Create profile timeout after 10 seconds')), 10000);
              });
              
              const { data: createdProfile, error: createError } = await Promise.race([
                createProfilePromise,
                createTimeoutPromise
              ]) as any;
            
              if (createError) {
                console.error('AuthContext: Error creating profile:', createError);
                
                // If creation fails, use a temporary profile
                const tempProfile: AccountProfile = {
                  ...newProfileData,
                  preferences: {
                    activeProfileId: uuidv4(),
                    studentProfiles: [{
                      id: uuidv4(),
                      profile_name: newProfileData.full_name?.split(' ')[0] || 'Student',
                      profile_color: '#3b82f6',
                      preferences: {},
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      is_active: true,
                    }]
                  }
                };
                
                setAccount(tempProfile);
                setStudentProfiles(tempProfile.preferences.studentProfiles);
                setActiveStudentProfile(tempProfile.preferences.studentProfiles[0]);
                console.log('AuthContext: Using temporary profile due to creation error');
                return;
              }
            
              console.log('AuthContext: New profile created:', createdProfile);
            
              // Create default student profile
              const defaultStudentProfile: StudentProfile = {
                id: uuidv4(),
                profile_name: createdProfile.full_name?.split(' ')[0] || 'Student',
                profile_color: '#3b82f6',
                preferences: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_active: true,
              };
            
              // Update the profile with the default student profile
              const updatedPreferences = {
                activeProfileId: defaultStudentProfile.id,
                studentProfiles: [defaultStudentProfile]
              };
            
              try {
                await supabase
                  .from('profiles')
                  .update({ preferences: updatedPreferences })
                  .eq('id', userId);
                console.log('AuthContext: Profile preferences updated successfully');
              } catch (updateError) {
                console.warn('AuthContext: Failed to update profile preferences, continuing with local state:', updateError);
              }
            
              setAccount({ ...createdProfile, preferences: updatedPreferences } as AccountProfile);
              setStudentProfiles([defaultStudentProfile]);
              setActiveStudentProfile(defaultStudentProfile);
              console.log('AuthContext: New user setup completed successfully');
              return;
            } catch (createTimeoutError) {
              console.error('AuthContext: Profile creation timed out:', createTimeoutError);
              
              // Use temporary profile if creation times out
              const tempProfile: AccountProfile = {
                ...newProfileData,
                preferences: {
                  activeProfileId: uuidv4(),
                  studentProfiles: [{
                    id: uuidv4(),
                    profile_name: newProfileData.full_name?.split(' ')[0] || 'Student',
                    profile_color: '#3b82f6',
                    preferences: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    is_active: true,
                  }]
                }
              };
              
              setAccount(tempProfile);
              setStudentProfiles(tempProfile.preferences.studentProfiles);
              setActiveStudentProfile(tempProfile.preferences.studentProfiles[0]);
              console.log('AuthContext: Using temporary profile due to creation timeout');
              return;
            }
          }
        }
        
        // For any other error, use temporary profile
        console.error('AuthContext: Unhandled profile error, using temporary profile');
        const tempProfile: AccountProfile = {
          id: userId,
          email: user?.email || 'user@example.com',
          full_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'User',
          role: 'user',
          created_at: new Date().toISOString(),
          plan_id: null,
          credits_remaining: 100,
          onboarding_completed: false,
          updated_at: new Date().toISOString(),
          preferences: {
            activeProfileId: uuidv4(),
            studentProfiles: [{
              id: uuidv4(),
              profile_name: user?.user_metadata?.full_name?.split(' ')[0] || 'Student',
              profile_color: '#3b82f6',
              preferences: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_active: true,
            }]
          }
        };
        
        setAccount(null);
        setStudentProfiles(null);
        setActiveStudentProfile(null);
        return;
      }
      
      console.log('AuthContext: Profile data fetched successfully:', profileData);
      setAccount(profileData as AccountProfile);

      // Handle student profiles stored in preferences
      let currentStudentProfiles: StudentProfile[] = [];
      let currentActiveStudentProfile: StudentProfile | null = null;
      const userPreferences = profileData.preferences as AccountPreferences | null;

      console.log('AuthContext: Processing user preferences:', userPreferences);

      if (userPreferences && Array.isArray(userPreferences.studentProfiles) && userPreferences.studentProfiles.length > 0) {
        currentStudentProfiles = userPreferences.studentProfiles;
        console.log('AuthContext: Found existing student profiles:', currentStudentProfiles.length);
        
        // Try to find the active profile
        if (userPreferences.activeProfileId) {
          currentActiveStudentProfile = currentStudentProfiles.find(p => p.id === userPreferences.activeProfileId) || null;
          console.log('AuthContext: Found active profile by ID:', currentActiveStudentProfile?.profile_name);
        }
        
        // If no active profile found or activeProfileId is missing, default to the first one
        if (!currentActiveStudentProfile) {
          currentActiveStudentProfile = currentStudentProfiles[0];
          console.log('AuthContext: Defaulting to first profile:', currentActiveStudentProfile.profile_name);
          
          // Update preferences to set this as active
          const updatedPreferences = { ...userPreferences, activeProfileId: currentActiveStudentProfile.id };
          try {
            await supabase
              .from('profiles')
              .update({ preferences: updatedPreferences })
              .eq('id', userId);
            console.log('AuthContext: Updated active profile in database');
          } catch (updateError) {
            console.warn('AuthContext: Failed to update active profile, continuing with local state:', updateError);
          }
        }
      } else {
        console.log('AuthContext: No student profiles found, creating default profile');
        
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
        
        console.log('AuthContext: Created default profile:', defaultProfile.profile_name);
        
        const updatedPreferences = { 
          activeProfileId: defaultProfile.id, 
          studentProfiles: currentStudentProfiles 
        };
        
        try {
          await supabase
            .from('profiles')
            .update({ preferences: updatedPreferences })
            .eq('id', userId);
          console.log('AuthContext: Saved default profile to database');
        } catch (updateError) {
          console.warn('AuthContext: Failed to save default profile, continuing with local state:', updateError);
        }
      }
      
      setStudentProfiles(currentStudentProfiles);
      setActiveStudentProfile(currentActiveStudentProfile);
      console.log('AuthContext: fetchAccountAndProfiles completed successfully. Active profile:', currentActiveStudentProfile?.profile_name);

    } catch (error) {
      console.error('AuthContext: Error in fetchAccountAndProfiles catch block:', error);
      
      // Instead of setting everything to null, create a fallback profile
      console.log('AuthContext: Creating fallback profile due to error');
      const fallbackProfile: AccountProfile = {
        id: userId,
        email: user?.email || 'user@example.com',
        full_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'User',
        role: 'user',
        created_at: new Date().toISOString(),
        plan_id: null,
        credits_remaining: 100,
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
        preferences: {
          activeProfileId: uuidv4(),
          studentProfiles: [{
            id: uuidv4(),
            profile_name: user?.user_metadata?.full_name?.split(' ')[0] || 'Student',
            profile_color: '#3b82f6',
            preferences: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
          }]
        }
      };
      
      setAccount(fallbackProfile);
      setStudentProfiles(fallbackProfile.preferences.studentProfiles);
      setActiveStudentProfile(fallbackProfile.preferences.studentProfiles[0]);
      console.log('AuthContext: Fallback profile setup completed');
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
    console.log('AuthContext: signIn called for email:', email);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    console.log('AuthContext: signIn completed, error:', error);
    return { error };
  };

  // Sign in with Google function
  const signInWithGoogle = async () => {
    console.log('AuthContext: signInWithGoogle called');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/profile-selection`
      }
    });
    console.log('AuthContext: signInWithGoogle completed, error:', error);
    return { error };
  };

  // Sign up function
  const signUp = async (email: string, password: string, fullName: string) => {
    console.log('AuthContext: signUp called for email:', email);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    console.log('AuthContext: signUp completed, error:', error);
    return { error };
  };

  // Reset password function
  const resetPassword = async (email: string) => {
    console.log('AuthContext: resetPassword called for email:', email);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    console.log('AuthContext: resetPassword completed, error:', error);
    return { error };
  };

  // Update account function
  const updateAccount = async (updates: Partial<AccountProfile>) => {
    console.log('AuthContext: updateAccount called with updates:', updates);
    if (!user) return { error: new Error('No user logged in') as AuthError };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (!error && account) {
      setAccount({ ...account, ...updates });
      console.log('AuthContext: Account updated successfully');
    } else {
      console.error('AuthContext: Error updating account:', error);
    }

    return { error };
  };

  // Sign out function
  const signOut = async () => {
    console.log('AuthContext: signOut called');
    await supabase.auth.signOut();
    console.log('AuthContext: signOut completed');
  };

  // Select student profile function
  const selectStudentProfile = async (profileId: string) => {
    console.log('AuthContext: selectStudentProfile called for profileId:', profileId);
    if (!user || !account || !studentProfiles) {
      console.log('AuthContext: selectStudentProfile - missing required data');
      return;
    }

    const targetProfile = studentProfiles.find(p => p.id === profileId);
    if (!targetProfile) {
      console.log('AuthContext: selectStudentProfile - target profile not found');
      return;
    }

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
      console.log('AuthContext: selectStudentProfile completed successfully');
    } else {
      console.error('AuthContext: Error selecting student profile:', error);
    }
  };

  // Create student profile function
  const createStudentProfile = async (profileName: string, profileColor: string = '#3b82f6') => {
    console.log('AuthContext: createStudentProfile called:', profileName, profileColor);
    if (!user || !account) return { error: new Error('No user logged in') as AuthError };

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
      console.log('AuthContext: createStudentProfile completed successfully');
    } else {
      console.error('AuthContext: Error creating student profile:', error);
    }

    return { error };
  };

  // Update student profile function
  const updateStudentProfile = async (profileId: string, updates: Partial<StudentProfile>) => {
    console.log('AuthContext: updateStudentProfile called:', profileId, updates);
    if (!user || !account || !studentProfiles) return { error: new Error('No user logged in') as AuthError };

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
      console.log('AuthContext: updateStudentProfile completed successfully');
    } else {
      console.error('AuthContext: Error updating student profile:', error);
    }

    return { error };
  };

  // Delete student profile function
  const deleteStudentProfile = async (profileId: string) => {
    console.log('AuthContext: deleteStudentProfile called:', profileId);
    if (!user || !account || !studentProfiles) return { error: new Error('No user logged in') as AuthError };

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
      console.log('AuthContext: deleteStudentProfile completed successfully');
    } else {
      console.error('AuthContext: Error deleting student profile:', error);
    }

    return { error };
  };

  // Initialize auth state
  useEffect(() => {
    console.log('AuthContext: useEffect mounted, initial loading set to true.');
    
    const initializeAuth = async () => {
      try {
        console.log('AuthContext: Getting initial session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('AuthContext: Error getting session:', error);
          setLoading(false);
          return;
        }
        
        console.log('AuthContext: getSession resolved, session:', session ? 'exists' : 'null');
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('AuthContext: User found, fetching account and profiles...');
          await fetchAccountAndProfiles(session.user.id);
        } else {
          console.log('AuthContext: No user session found');
        }
      } catch (error) {
        console.error('AuthContext: Error in initializeAuth:', error);
      } finally {
        console.log('AuthContext: initializeAuth completed, setting loading to false.');
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthContext: Auth state changed event:', event, 'session:', session ? 'exists' : 'null');
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('AuthContext: User session found, fetching account and profiles...');
          await fetchAccountAndProfiles(session.user.id);
        } else {
          console.log('AuthContext: No user session, clearing state');
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

  const value: AuthContextType = {
    user,
    account,
    studentProfiles,
    activeStudentProfile,
    session,
    loading,
    signIn,
    signInWithGoogle,
    signUp,
    resetPassword,
    updateAccount,
    signOut,
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

// Export the useAuth hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};