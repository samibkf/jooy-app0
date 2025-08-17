/*
  # Add preferences column to profiles table

  1. Changes
    - Add `preferences` column to `profiles` table
    - Column type: jsonb (allows storing JSON data)
    - Default value: empty JSON object
    - Nullable: true (allows existing records to have null initially)

  2. Purpose
    - Store student profile data and account preferences
    - Enable profile management functionality
    - Support multiple student profiles per account
*/

-- Add preferences column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'preferences'
  ) THEN
    ALTER TABLE profiles ADD COLUMN preferences jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;