/*
  # Multi-User Authentication System

  1. New Tables
    - `student_profiles` - Individual student profiles linked to accounts
    - Rename `profiles` to `accounts` for clarity
    
  2. Schema Changes
    - Add `student_profile_id` to all data tables
    - Maintain backward compatibility with existing `user_id` columns
    
  3. Security
    - Enable RLS on all new tables
    - Update policies to work with student profiles
    - Add helper functions for ownership validation
    
  4. Data Migration
    - Automatically migrate existing single-user data
    - Create default student profiles for existing accounts
*/

-- Step 1: Create helper function to check student profile ownership
CREATE OR REPLACE FUNCTION is_student_profile_owner(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM student_profiles 
    WHERE id = profile_id AND account_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Rename profiles table to accounts (if not already done)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    -- Rename the table
    ALTER TABLE profiles RENAME TO accounts;
    
    -- Update any existing policies that reference the old table name
    DROP POLICY IF EXISTS "Users can view their own profile" ON accounts;
    DROP POLICY IF EXISTS "Users can update their own profile" ON accounts;
    DROP POLICY IF EXISTS "Allow signup profile creation" ON accounts;
    DROP POLICY IF EXISTS "Admins can view all profiles" ON accounts;
    DROP POLICY IF EXISTS "Admins can manage all profiles" ON accounts;
    
    -- Recreate policies with updated names
    CREATE POLICY "Users can view their own account"
      ON accounts FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
      
    CREATE POLICY "Users can update their own account"
      ON accounts FOR UPDATE
      TO authenticated
      USING (auth.uid() = id);
      
    CREATE POLICY "Allow signup account creation"
      ON accounts FOR INSERT
      TO public
      WITH CHECK (true);
      
    CREATE POLICY "Admins can view all accounts"
      ON accounts FOR SELECT
      TO authenticated
      USING (is_admin(auth.uid()));
      
    CREATE POLICY "Admins can manage all accounts"
      ON accounts FOR ALL
      TO authenticated
      USING (is_admin(auth.uid()));
  END IF;
END $$;

-- Step 3: Create student_profiles table
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_name TEXT NOT NULL CHECK (length(trim(profile_name)) > 0),
  avatar_url TEXT,
  profile_color TEXT DEFAULT '#3b82f6',
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  -- Constraint: Maximum 10 profiles per account
  CONSTRAINT max_profiles_per_account CHECK (
    (SELECT COUNT(*) FROM student_profiles WHERE account_id = student_profiles.account_id) <= 10
  )
);

-- Enable RLS on student_profiles
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for student_profiles
CREATE POLICY "Account owners can manage their student profiles"
  ON student_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = account_id)
  WITH CHECK (auth.uid() = account_id);

CREATE POLICY "Admins can view all student profiles"
  ON student_profiles FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- Step 4: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_profiles_account_id ON student_profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_last_accessed ON student_profiles(account_id, last_accessed_at DESC);

-- Step 5: Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_student_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_student_profiles_updated_at();

-- Step 6: Add student_profile_id columns to existing data tables
DO $$
BEGIN
  -- Add student_profile_id to documents table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_documents_student_profile_id ON documents(student_profile_id);
  END IF;

  -- Add student_profile_id to document_regions table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_regions' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE document_regions ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_document_regions_student_profile_id ON document_regions(student_profile_id);
  END IF;

  -- Add student_profile_id to text_assignments table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'text_assignments' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE text_assignments ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_text_assignments_student_profile_id ON text_assignments(student_profile_id);
  END IF;

  -- Add student_profile_id to tts_requests table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tts_requests' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE tts_requests ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_tts_requests_student_profile_id ON tts_requests(student_profile_id);
  END IF;

  -- Add student_profile_id to notifications table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_notifications_student_profile_id ON notifications(student_profile_id);
  END IF;

  -- Add student_profile_id to document_texts table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_texts' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE document_texts ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_document_texts_student_profile_id ON document_texts(student_profile_id);
  END IF;

  -- Add student_profile_id to folders table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'folders' AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE folders ADD COLUMN student_profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_folders_student_profile_id ON folders(student_profile_id);
  END IF;
END $$;

-- Step 7: Create data migration function
CREATE OR REPLACE FUNCTION migrate_existing_data_to_multi_user()
RETURNS VOID AS $$
DECLARE
  account_record RECORD;
  default_profile_id UUID;
BEGIN
  -- For each account, create a default student profile and migrate data
  FOR account_record IN SELECT * FROM accounts LOOP
    -- Create default student profile
    INSERT INTO student_profiles (account_id, profile_name, last_accessed_at)
    VALUES (account_record.id, 'Student 1', now())
    RETURNING id INTO default_profile_id;
    
    -- Migrate documents
    UPDATE documents 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    -- Migrate document_regions
    UPDATE document_regions 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    -- Migrate text_assignments
    UPDATE text_assignments 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    -- Migrate tts_requests (using profiles table reference)
    UPDATE tts_requests 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    -- Migrate notifications
    UPDATE notifications 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    -- Migrate document_texts
    UPDATE document_texts 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
    
    -- Migrate folders
    UPDATE folders 
    SET student_profile_id = default_profile_id 
    WHERE user_id = account_record.id AND student_profile_id IS NULL;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Execute the data migration
SELECT migrate_existing_data_to_multi_user();

-- Step 9: Add new RLS policies for student profile access
-- Documents policies
CREATE POLICY "Students can view their own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own documents"
  ON documents FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can delete their own documents"
  ON documents FOR DELETE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- Document regions policies
CREATE POLICY "Students can view their own document regions"
  ON document_regions FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own document regions"
  ON document_regions FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own document regions"
  ON document_regions FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can delete their own document regions"
  ON document_regions FOR DELETE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- Text assignments policies
CREATE POLICY "Students can view their own text assignments"
  ON text_assignments FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own text assignments"
  ON text_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own text assignments"
  ON text_assignments FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can delete their own text assignments"
  ON text_assignments FOR DELETE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- TTS requests policies
CREATE POLICY "Students can view their own tts requests"
  ON tts_requests FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own tts requests"
  ON tts_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own tts requests"
  ON tts_requests FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- Notifications policies
CREATE POLICY "Students can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- Document texts policies
CREATE POLICY "Students can view their own document texts"
  ON document_texts FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own document texts"
  ON document_texts FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own document texts"
  ON document_texts FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can delete their own document texts"
  ON document_texts FOR DELETE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- Folders policies
CREATE POLICY "Students can view their own folders"
  ON folders FOR SELECT
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can create their own folders"
  ON folders FOR INSERT
  TO authenticated
  WITH CHECK (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can update their own folders"
  ON folders FOR UPDATE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

CREATE POLICY "Students can delete their own folders"
  ON folders FOR DELETE
  TO authenticated
  USING (
    student_profile_id IS NOT NULL AND 
    is_student_profile_owner(student_profile_id)
  );

-- Step 10: Create function to automatically create default profile for new users
CREATE OR REPLACE FUNCTION handle_new_user_multi_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Create default student profile for new account
  INSERT INTO student_profiles (account_id, profile_name, last_accessed_at)
  VALUES (NEW.id, 'Student 1', now());
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created_multi_profile ON accounts;
CREATE TRIGGER on_auth_user_created_multi_profile
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_multi_profile();

-- Step 11: Create view for easy student profile access with account info
CREATE OR REPLACE VIEW student_profiles_with_account AS
SELECT 
  sp.*,
  a.email as account_email,
  a.full_name as account_name,
  a.credits_remaining,
  a.role as account_role
FROM student_profiles sp
JOIN accounts a ON sp.account_id = a.id
WHERE sp.is_active = true;

-- Enable RLS on the view
ALTER VIEW student_profiles_with_account SET (security_barrier = true);

-- Step 12: Create function to switch active profile and update last_accessed_at
CREATE OR REPLACE FUNCTION switch_to_profile(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify the profile belongs to the current user
  IF NOT is_student_profile_owner(profile_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Update last_accessed_at for the selected profile
  UPDATE student_profiles 
  SET last_accessed_at = now() 
  WHERE id = profile_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;