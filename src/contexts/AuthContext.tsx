// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';

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
};