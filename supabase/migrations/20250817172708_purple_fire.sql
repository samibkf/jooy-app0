/*
  # Multi-User Authentication Schema Migration

  This migration transforms the existing single-user system into a multi-user system where:
  - Multiple student profiles can be associated with a single account
  - All students share the same login credentials (email/password)
  - Each student has their own personalized experience and data separation

  ## Changes Made

  1. **Rename `profiles` to `accounts`**
     - Represents the shared account with login credentials
     - Maintains subscription and credit information at account level

  2. **Create `student_profiles` table**
     - Individual student profiles linked to an account
     - Each student has their own name, avatar, and settings

  3. **Update existing data tables**
     - Add `student_profile_id` columns to link data to specific students
     - Maintain backward compatibility during transition

  4. **Update RLS policies**
     - Ensure proper data isolation between student profiles
     - Maintain security while allowing shared account access

  ## Security Considerations
  - All RLS policies validate that student profiles belong to the authenticated account
  - Data isolation is enforced at the database level
  - Account-level operations require proper authentication
*/

-- Step 1: Create the new student_profiles table first
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  profile_name text NOT NULL,
  avatar_url text,
  profile_settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_accessed_at timestamptz
);

-- Enable RLS on student_profiles
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- Step 2: Rename profiles table to accounts (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    -- Rename the table
    ALTER TABLE public.profiles RENAME TO accounts;
    
    -- Update any existing indexes
    DO $rename_indexes$
    DECLARE
      index_record RECORD;
    BEGIN
      FOR index_record IN 
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'accounts' 
        AND schemaname = 'public'
        AND indexname LIKE '%profiles%'
      LOOP
        EXECUTE 'DROP INDEX IF EXISTS ' || index_record.indexname;
        EXECUTE replace(index_record.indexdef, 'profiles', 'accounts');
      END LOOP;
    END $rename_indexes$;
    
    RAISE NOTICE 'Successfully renamed profiles table to accounts';
  ELSE
    RAISE NOTICE 'Profiles table does not exist, skipping rename';
  END IF;
END $$;

-- Step 3: Ensure accounts table has proper structure
DO $$
BEGIN
  -- Add any missing columns to accounts table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Step 4: Add foreign key constraint for student_profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts' AND table_schema = 'public') THEN
    ALTER TABLE public.student_profiles 
    ADD CONSTRAINT student_profiles_account_id_fkey 
    FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 5: Create updated_at trigger for student_profiles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to student_profiles
DROP TRIGGER IF EXISTS update_student_profiles_updated_at ON public.student_profiles;
CREATE TRIGGER update_student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Add student_profile_id columns to existing data tables
-- Documents table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.documents 
    ADD CONSTRAINT documents_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_documents_student_profile_id 
    ON public.documents(student_profile_id);
  END IF;
END $$;

-- Document regions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_regions' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.document_regions ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.document_regions 
    ADD CONSTRAINT document_regions_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_document_regions_student_profile_id 
    ON public.document_regions(student_profile_id);
  END IF;
END $$;

-- Text assignments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'text_assignments' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.text_assignments ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.text_assignments 
    ADD CONSTRAINT text_assignments_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_text_assignments_student_profile_id 
    ON public.text_assignments(student_profile_id);
  END IF;
END $$;

-- TTS requests table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tts_requests' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.tts_requests ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.tts_requests 
    ADD CONSTRAINT tts_requests_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_tts_requests_student_profile_id 
    ON public.tts_requests(student_profile_id);
  END IF;
END $$;

-- Notifications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_notifications_student_profile_id 
    ON public.notifications(student_profile_id);
  END IF;
END $$;

-- Document texts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_texts' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.document_texts ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.document_texts 
    ADD CONSTRAINT document_texts_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_document_texts_student_profile_id 
    ON public.document_texts(student_profile_id);
  END IF;
END $$;

-- Folders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'folders' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE public.folders ADD COLUMN student_profile_id uuid;
    
    -- Add foreign key constraint
    ALTER TABLE public.folders 
    ADD CONSTRAINT folders_student_profile_id_fkey 
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_folders_student_profile_id 
    ON public.folders(student_profile_id);
  END IF;
END $$;

-- Step 7: Create RLS policies for student_profiles
CREATE POLICY "Account owners can manage their student profiles"
  ON public.student_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = account_id)
  WITH CHECK (auth.uid() = account_id);

-- Step 8: Create helper function to check if a student profile belongs to the current account
CREATE OR REPLACE FUNCTION public.is_student_profile_owner(profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.student_profiles 
    WHERE id = profile_id 
    AND account_id = auth.uid()
  );
END;
$$;

-- Step 9: Update RLS policies for data tables to use student_profile_id
-- Documents table policies
DROP POLICY IF EXISTS "Users can CRUD their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can create their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;

CREATE POLICY "Account owners can manage documents via student profiles"
  ON public.documents
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- Document regions table policies
DROP POLICY IF EXISTS "Users can manage their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can create their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can delete their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can insert their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can update their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can view their own document regions" ON public.document_regions;

CREATE POLICY "Account owners can manage document regions via student profiles"
  ON public.document_regions
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- Text assignments table policies
DROP POLICY IF EXISTS "Users can create their own text assignments" ON public.text_assignments;
DROP POLICY IF EXISTS "Users can delete their own text assignments" ON public.text_assignments;
DROP POLICY IF EXISTS "Users can update their own text assignments" ON public.text_assignments;

CREATE POLICY "Account owners can manage text assignments via student profiles"
  ON public.text_assignments
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- TTS requests table policies
DROP POLICY IF EXISTS "Users can manage their own TTS requests" ON public.tts_requests;

CREATE POLICY "Account owners can manage TTS requests via student profiles"
  ON public.tts_requests
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- Notifications table policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Account owners can manage notifications via student profiles"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- Document texts table policies
DROP POLICY IF EXISTS "Users can create their own document texts" ON public.document_texts;
DROP POLICY IF EXISTS "Users can delete their own document texts" ON public.document_texts;
DROP POLICY IF EXISTS "Users can update their own document texts" ON public.document_texts;

CREATE POLICY "Account owners can manage document texts via student profiles"
  ON public.document_texts
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- Folders table policies
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;

CREATE POLICY "Account owners can manage folders via student profiles"
  ON public.folders
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN student_profile_id IS NOT NULL THEN is_student_profile_owner(student_profile_id)
      WHEN user_id IS NOT NULL THEN auth.uid() = user_id  -- Backward compatibility
      ELSE false
    END
  );

-- Step 10: Update admin policies to work with new schema
-- Update existing admin policies to check accounts table instead of profiles
DO $$
BEGIN
  -- Update is_admin function if it exists
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
    CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $func$
    BEGIN
      RETURN EXISTS (
        SELECT 1 
        FROM public.accounts 
        WHERE id = user_id 
        AND role = 'admin'::user_role
      );
    END;
    $func$;
  END IF;
END $$;

-- Step 11: Create data migration function for existing users
CREATE OR REPLACE FUNCTION public.migrate_existing_data_to_student_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  account_record RECORD;
  default_profile_id uuid;
BEGIN
  -- For each account that doesn't have any student profiles yet
  FOR account_record IN 
    SELECT a.id, a.full_name, a.email
    FROM public.accounts a
    LEFT JOIN public.student_profiles sp ON sp.account_id = a.id
    WHERE sp.id IS NULL
  LOOP
    -- Create a default student profile
    INSERT INTO public.student_profiles (account_id, profile_name, last_accessed_at)
    VALUES (
      account_record.id, 
      COALESCE(account_record.full_name, 'Student 1'),
      now()
    )
    RETURNING id INTO default_profile_id;
    
    -- Migrate existing data to use the new student profile
    UPDATE public.documents 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    UPDATE public.document_regions 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    UPDATE public.text_assignments 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    UPDATE public.tts_requests 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    UPDATE public.notifications 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    UPDATE public.document_texts 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    UPDATE public.folders 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    RAISE NOTICE 'Migrated data for account: % (ID: %)', account_record.email, account_record.id;
  END LOOP;
  
  RAISE NOTICE 'Data migration completed successfully';
END;
$$;

-- Step 12: Execute the data migration
SELECT public.migrate_existing_data_to_student_profiles();

-- Step 13: Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user_with_student_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  default_profile_id uuid;
BEGIN
  -- Create default student profile for new account
  INSERT INTO public.student_profiles (account_id, profile_name, last_accessed_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.full_name, 'Student 1'),
    now()
  )
  RETURNING id INTO default_profile_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new account creation (if accounts table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS on_account_created ON public.accounts;
    CREATE TRIGGER on_account_created
      AFTER INSERT ON public.accounts
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_with_student_profile();
  END IF;
END $$;

-- Step 14: Add constraints and validation
-- Ensure profile names are not empty
ALTER TABLE public.student_profiles 
ADD CONSTRAINT student_profiles_profile_name_not_empty 
CHECK (length(trim(profile_name)) > 0);

-- Limit number of student profiles per account (optional - adjust as needed)
CREATE OR REPLACE FUNCTION public.check_student_profile_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT COUNT(*) 
    FROM public.student_profiles 
    WHERE account_id = NEW.account_id
  ) >= 10 THEN  -- Limit to 10 profiles per account
    RAISE EXCEPTION 'Maximum number of student profiles (10) reached for this account';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_student_profile_limit_trigger ON public.student_profiles;
CREATE TRIGGER check_student_profile_limit_trigger
  BEFORE INSERT ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_student_profile_limit();

-- Step 15: Grant necessary permissions
GRANT ALL ON public.student_profiles TO authenticated;
GRANT ALL ON public.student_profiles TO service_role;

-- Final step: Add helpful comments
COMMENT ON TABLE public.student_profiles IS 'Individual student profiles associated with shared accounts';
COMMENT ON COLUMN public.student_profiles.account_id IS 'Links to the shared account (auth.users.id)';
COMMENT ON COLUMN public.student_profiles.profile_name IS 'Display name for the student profile';
COMMENT ON COLUMN public.student_profiles.profile_settings IS 'JSON object for student-specific settings and preferences';
COMMENT ON COLUMN public.student_profiles.last_accessed_at IS 'Timestamp of when this profile was last selected/used';

COMMENT ON FUNCTION public.is_student_profile_owner(uuid) IS 'Helper function to check if a student profile belongs to the current authenticated account';
COMMENT ON FUNCTION public.migrate_existing_data_to_student_profiles() IS 'One-time migration function to convert existing single-user data to multi-user format';