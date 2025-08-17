import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

// Hook for fetching student-specific data
export const useStudentDocuments = () => {
  const { activeStudentProfile } = useAuth();
  
  return useQuery({
    queryKey: ['student-documents', activeStudentProfile?.id],
    queryFn: async () => {
      if (!activeStudentProfile) {
        throw new Error('No active student profile');
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('student_profile_id', activeStudentProfile.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch documents: ${error.message}`);
      }

      return data;
    },
    enabled: !!activeStudentProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Hook for creating student-specific documents
export const useCreateStudentDocument = () => {
  const { activeStudentProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentData: { name: string; metadata?: any; folder_id?: string }) => {
      if (!activeStudentProfile) {
        throw new Error('No active student profile');
      }

      const { data, error } = await supabase
        .from('documents')
        .insert({
          ...documentData,
          student_profile_id: activeStudentProfile.id,
          user_id: activeStudentProfile.account_id, // Keep for backward compatibility
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create document: ${error.message}`);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-documents', activeStudentProfile?.id] });
      toast({ title: "Success", description: "Document created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
};

// Hook for fetching student-specific folders
export const useStudentFolders = () => {
  const { activeStudentProfile } = useAuth();
  
  return useQuery({
    queryKey: ['student-folders', activeStudentProfile?.id],
    queryFn: async () => {
      if (!activeStudentProfile) {
        throw new Error('No active student profile');
      }

      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('student_profile_id', activeStudentProfile.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch folders: ${error.message}`);
      }

      return data;
    },
    enabled: !!activeStudentProfile,
    staleTime: 5 * 60 * 1000,
  });
};

// Hook for student-specific notifications
export const useStudentNotifications = () => {
  const { activeStudentProfile } = useAuth();
  
  return useQuery({
    queryKey: ['student-notifications', activeStudentProfile?.id],
    queryFn: async () => {
      if (!activeStudentProfile) {
        throw new Error('No active student profile');
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('student_profile_id', activeStudentProfile.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch notifications: ${error.message}`);
      }

      return data;
    },
    enabled: !!activeStudentProfile,
    staleTime: 2 * 60 * 1000, // 2 minutes for notifications
  });
};

// Generic hook for any student-specific data
export const useStudentData = <T>(
  tableName: string,
  select: string = '*',
  additionalFilters?: Record<string, any>
) => {
  const { activeStudentProfile } = useAuth();
  
  return useQuery({
    queryKey: ['student-data', tableName, activeStudentProfile?.id, additionalFilters],
    queryFn: async () => {
      if (!activeStudentProfile) {
        throw new Error('No active student profile');
      }

      let query = supabase
        .from(tableName)
        .select(select)
        .eq('student_profile_id', activeStudentProfile.id);

      // Apply additional filters if provided
      if (additionalFilters) {
        Object.entries(additionalFilters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch ${tableName}: ${error.message}`);
      }

      return data as T[];
    },
    enabled: !!activeStudentProfile,
    staleTime: 5 * 60 * 1000,
  });
};