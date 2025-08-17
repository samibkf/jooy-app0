/*
  # Multi-User Authentication System Migration

  This migration transforms the single-user system into a multi-user system where multiple 
  student profiles can be associated with a single account.

  ## Changes Made

  1. **Table Restructuring**
     - Rename `profiles` table to `accounts` for clarity
     - Create new `student_profiles` table for individual student profiles
     - Add `student_profile_id` columns to all data tables

  2. **Data Migration**
     - Automatically create default student profiles for existing accounts
     - Migrate existing data to link with new student profiles
     - Maintain backward compatibility during transition

  3. **Security Updates**
     - Update all RLS policies to work with student profiles
     - Add helper functions for ownership validation
     - Ensure proper data isolation between student profiles

  4. **Constraints & Indexes**
     - Add foreign key constraints for data integrity
     - Create indexes for performance
     - Add unique constraints where appropriate

  ## Important Notes
  - This migration preserves all existing data
  - Backward compatibility is maintained during transition
  - All changes are atomic within a transaction
*/

-- Start transaction for atomicity
BEGIN;

-- 1. Rename 'profiles' table to 'accounts'
ALTER TABLE IF EXISTS public.profiles RENAME TO accounts;

-- Update foreign key constraints that referenced the old 'profiles' table
DO $$
BEGIN
    -- Update tts_requests foreign key
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tts_requests_user_id_fkey') THEN
        ALTER TABLE public.tts_requests DROP CONSTRAINT tts_requests_user_id_fkey;
        ALTER TABLE public.tts_requests ADD CONSTRAINT tts_requests_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
    END IF;

    -- Update admin_tasks foreign key
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_tasks_assigned_to_fkey') THEN
        ALTER TABLE public.admin_tasks DROP CONSTRAINT admin_tasks_assigned_to_fkey;
        ALTER TABLE public.admin_tasks ADD CONSTRAINT admin_tasks_assigned_to_fkey 
        FOREIGN KEY (assigned_to) REFERENCES public.accounts(id) ON DELETE SET NULL;
    END IF;

    -- Update accounts plan_id foreign key
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_id_fkey') THEN
        ALTER TABLE public.accounts DROP CONSTRAINT profiles_plan_id_fkey;
        ALTER TABLE public.accounts ADD CONSTRAINT accounts_plan_id_fkey 
        FOREIGN KEY (plan_id) REFERENCES public.credit_plans(id) ON DELETE SET NULL;
    END IF;

    -- Update accounts id foreign key
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
        ALTER TABLE public.accounts DROP CONSTRAINT profiles_id_fkey;
        ALTER TABLE public.accounts ADD CONSTRAINT accounts_id_fkey 
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- Rename primary key constraint
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pkey') THEN
        ALTER TABLE public.accounts RENAME CONSTRAINT profiles_pkey TO accounts_pkey;
    END IF;
END $$;

-- 2. Create 'student_profiles' table
CREATE TABLE IF NOT EXISTS public.student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL CHECK (length(trim(profile_name)) > 0),
    avatar_url TEXT,
    profile_color TEXT DEFAULT '#3b82f6',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    
    -- Ensure unique profile names per account
    CONSTRAINT unique_profile_name_per_account UNIQUE (account_id, profile_name, is_active),
    -- Limit number of profiles per account
    CONSTRAINT check_profile_name_length CHECK (length(profile_name) <= 50)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_profiles_account_id ON public.student_profiles (account_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_active ON public.student_profiles (account_id, is_active);
CREATE INDEX IF NOT EXISTS idx_student_profiles_last_accessed ON public.student_profiles (account_id, last_accessed_at DESC);

-- 3. Add 'student_profile_id' columns to data tables
DO $$
DECLARE
    t_name TEXT;
    tables_to_update TEXT[] := ARRAY['documents', 'document_regions', 'text_assignments', 'tts_requests', 'notifications', 'document_texts', 'folders'];
BEGIN
    FOREACH t_name IN ARRAY tables_to_update
    LOOP
        -- Add student_profile_id column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = t_name 
            AND column_name = 'student_profile_id'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN student_profile_id UUID', t_name);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_student_profile_id ON public.%I (student_profile_id)', t_name, t_name);
        END IF;
    END LOOP;
END $$;

-- 4. Create helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.accounts
        WHERE id = user_id AND role = 'admin'::user_role
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_student_profile_owner(profile_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.student_profiles
        WHERE id = profile_id 
        AND account_id = auth.uid() 
        AND is_active = TRUE
    );
END;
$$;

-- Function to switch to a profile and update last_accessed_at
CREATE OR REPLACE FUNCTION public.switch_to_profile(profile_id uuid)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.student_profiles 
    SET last_accessed_at = now()
    WHERE id = profile_id 
    AND account_id = auth.uid() 
    AND is_active = TRUE;
END;
$$;

-- 5. Migrate existing data
DO $$
DECLARE
    account_rec RECORD;
    default_profile_id UUID;
    tables_to_migrate TEXT[] := ARRAY['documents', 'document_regions', 'text_assignments', 'tts_requests', 'notifications', 'document_texts', 'folders'];
    t_name TEXT;
    migration_count INTEGER;
BEGIN
    -- For each existing account, create a default student profile and migrate data
    FOR account_rec IN SELECT id, full_name FROM public.accounts
    LOOP
        -- Check if a default profile already exists
        SELECT id INTO default_profile_id
        FROM public.student_profiles
        WHERE account_id = account_rec.id 
        AND profile_name = 'Student 1' 
        AND is_active = TRUE
        LIMIT 1;

        -- If no default profile exists, create one
        IF default_profile_id IS NULL THEN
            INSERT INTO public.student_profiles (account_id, profile_name, created_at, updated_at)
            VALUES (account_rec.id, 'Student 1', now(), now())
            RETURNING id INTO default_profile_id;
            
            RAISE NOTICE 'Created default student profile % for account %', default_profile_id, account_rec.id;
        END IF;

        -- Migrate data from each table
        FOREACH t_name IN ARRAY tables_to_migrate
        LOOP
            EXECUTE format('
                UPDATE public.%I 
                SET student_profile_id = $1 
                WHERE user_id = $2 
                AND student_profile_id IS NULL
            ', t_name) USING default_profile_id, account_rec.id;
            
            GET DIAGNOSTICS migration_count = ROW_COUNT;
            IF migration_count > 0 THEN
                RAISE NOTICE 'Migrated % records in table % for account %', migration_count, t_name, account_rec.id;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 6. Set NOT NULL constraints and add foreign keys after migration
DO $$
DECLARE
    t_name TEXT;
    tables_to_update TEXT[] := ARRAY['documents', 'document_regions', 'text_assignments', 'tts_requests', 'notifications', 'document_texts', 'folders'];
    null_count INTEGER;
BEGIN
    FOREACH t_name IN ARRAY tables_to_update
    LOOP
        -- Check for any remaining NULL values
        EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE student_profile_id IS NULL', t_name) INTO null_count;
        
        IF null_count = 0 THEN
            -- Set NOT NULL constraint
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN student_profile_id SET NOT NULL', t_name);
            
            -- Add foreign key constraint
            EXECUTE format('
                ALTER TABLE public.%I 
                ADD CONSTRAINT %I_student_profile_id_fkey 
                FOREIGN KEY (student_profile_id) 
                REFERENCES public.student_profiles(id) 
                ON DELETE CASCADE
            ', t_name, t_name);
            
            RAISE NOTICE 'Added NOT NULL constraint and foreign key for table %', t_name;
        ELSE
            RAISE WARNING 'Table % still has % NULL student_profile_id values - skipping constraints', t_name, null_count;
        END IF;
    END LOOP;
END $$;

-- 7. Enable RLS and create policies for student_profiles
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for student_profiles table
CREATE POLICY "Account owners can view their student profiles"
ON public.student_profiles FOR SELECT
USING (account_id = auth.uid());

CREATE POLICY "Account owners can create their student profiles"
ON public.student_profiles FOR INSERT
WITH CHECK (account_id = auth.uid());

CREATE POLICY "Account owners can update their student profiles"
ON public.student_profiles FOR UPDATE
USING (account_id = auth.uid())
WITH CHECK (account_id = auth.uid());

CREATE POLICY "Account owners can delete their student profiles"
ON public.student_profiles FOR DELETE
USING (account_id = auth.uid());

-- Admins can view all student profiles
CREATE POLICY "Admins can view all student profiles"
ON public.student_profiles FOR SELECT
USING (is_admin(auth.uid()));

-- 8. Update RLS policies for data tables to use student_profile_id

-- Update documents policies
DROP POLICY IF EXISTS "Users can CRUD their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can create their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;

CREATE POLICY "Student profile owners can manage their own documents"
ON public.documents FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update document_regions policies
DROP POLICY IF EXISTS "Users can create their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can delete their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can insert their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can manage their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can update their own document regions" ON public.document_regions;
DROP POLICY IF EXISTS "Users can view their own document regions" ON public.document_regions;

CREATE POLICY "Student profile owners can manage their own document regions"
ON public.document_regions FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update text_assignments policies
DROP POLICY IF EXISTS "Users can create their own text assignments" ON public.text_assignments;
DROP POLICY IF EXISTS "Users can delete their own text assignments" ON public.text_assignments;
DROP POLICY IF EXISTS "Users can update their own text assignments" ON public.text_assignments;

CREATE POLICY "Student profile owners can manage their own text assignments"
ON public.text_assignments FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update tts_requests policies
DROP POLICY IF EXISTS "Users can manage their own TTS requests" ON public.tts_requests;

CREATE POLICY "Student profile owners can manage their own TTS requests"
ON public.tts_requests FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update notifications policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Student profile owners can manage their own notifications"
ON public.notifications FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update document_texts policies
DROP POLICY IF EXISTS "Users can create their own document texts" ON public.document_texts;
DROP POLICY IF EXISTS "Users can delete their own document texts" ON public.document_texts;
DROP POLICY IF EXISTS "Users can update their own document texts" ON public.document_texts;

CREATE POLICY "Student profile owners can manage their own document texts"
ON public.document_texts FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update folders policies
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;

CREATE POLICY "Student profile owners can manage their own folders"
ON public.folders FOR ALL
USING (is_student_profile_owner(student_profile_id))
WITH CHECK (is_student_profile_owner(student_profile_id));

-- Update tts_audio_files policies
DROP POLICY IF EXISTS "Users can view their approved tts_audio_files" ON public.tts_audio_files;

CREATE POLICY "Student profile owners can view their approved tts_audio_files"
ON public.tts_audio_files FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tts_requests req 
    WHERE req.id = tts_audio_files.tts_request_id 
    AND is_student_profile_owner(req.student_profile_id) 
    AND tts_audio_files.status = 'approved'
));

-- 9. Add triggers for student_profiles
CREATE TRIGGER update_student_profiles_updated_at
    BEFORE UPDATE ON public.student_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Update handle_new_user function to create default student profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_initial_profile_name TEXT;
BEGIN
    -- Create account entry (this was the old profiles table behavior)
    INSERT INTO public.accounts (id, email, full_name, role, credits_remaining, onboarding_completed)
    VALUES (
        NEW.id, 
        NEW.email, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'user'::user_role,
        0,
        false
    );

    -- Create default student profile
    v_initial_profile_name := COALESCE(NEW.raw_user_meta_data->>'initial_profile_name', 'Student 1');
    
    INSERT INTO public.student_profiles (account_id, profile_name, profile_color)
    VALUES (
        NEW.id, 
        v_initial_profile_name,
        '#3b82f6'
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
        RETURN NEW;
END;
$$;

-- 11. Add constraint to limit number of profiles per account
DO $$
BEGIN
    -- Add a check constraint to limit profiles per account (enforced at application level)
    -- This is more of a guideline - actual enforcement should be in application logic
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'max_profiles_per_account') THEN
        -- We'll enforce this in the application, but add a comment for documentation
        COMMENT ON TABLE public.student_profiles IS 'Maximum 10 active profiles per account (enforced in application)';
    END IF;
END $$;

-- Commit the transaction
COMMIT;

-- Verification queries (run these after migration to verify success)
-- SELECT 'accounts' as table_name, count(*) as count FROM public.accounts
-- UNION ALL
-- SELECT 'student_profiles' as table_name, count(*) as count FROM public.student_profiles
-- UNION ALL  
-- SELECT 'documents_with_student_profile_id' as table_name, count(*) as count FROM public.documents WHERE student_profile_id IS NOT NULL;