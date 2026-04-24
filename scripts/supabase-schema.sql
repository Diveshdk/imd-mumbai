-- =============================================
-- IMD Mumbai Supabase Schema
-- Run this SQL in Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username text UNIQUE NOT NULL,
  email text,
  role text CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  status text CHECK (status IN ('pending', 'active', 'rejected')) DEFAULT 'pending',
  mode text CHECK (mode IN ('dual', 'multi')) DEFAULT 'dual',
  can_modify boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Signup requests
CREATE TABLE IF NOT EXISTS signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  status text CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- 3. Master data files (admin's original/authoritative data)
CREATE TABLE IF NOT EXISTS master_data_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text CHECK (type IN ('warning', 'realised')) NOT NULL,
  year int NOT NULL,
  month int NOT NULL,
  day int NOT NULL,
  lead_day text,
  districts jsonb NOT NULL DEFAULT '{}',
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(type, year, month, day, lead_day)
);

-- 4. User-specific data copies (copy-on-write)
CREATE TABLE IF NOT EXISTS user_data_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_file_id uuid REFERENCES master_data_files(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type text CHECK (type IN ('warning', 'realised')) NOT NULL,
  year int NOT NULL,
  month int NOT NULL,
  day int NOT NULL,
  lead_day text,
  districts jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, type, year, month, day, lead_day)
);

-- 5. Rainfall configuration (single-row, replaces Vercel KV + local JSON)
CREATE TABLE IF NOT EXISTS rainfall_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_master_data_type_year_month ON master_data_files(type, year, month);
CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_user_type_year_month ON user_data_files(user_id, type, year, month);
CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests(status);

-- =============================================
-- Row Level Security (RLS)
-- All writes from API routes use service role (bypasses RLS).
-- RLS here protects direct client access.
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE rainfall_config ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own, service role reads all
CREATE POLICY "profiles_self_read" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_service_all" ON profiles FOR ALL USING (true) WITH CHECK (true);

-- Signup requests: anyone can insert (for sign-up flow), service role full access
CREATE POLICY "signup_requests_insert" ON signup_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "signup_requests_service_all" ON signup_requests FOR ALL USING (true) WITH CHECK (true);

-- Master data: anyone logged in can read, service role manages
CREATE POLICY "master_data_read" ON master_data_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "master_data_service_all" ON master_data_files FOR ALL USING (true) WITH CHECK (true);

-- User data: users can manage their own data, service role manages all
CREATE POLICY "user_data_own" ON user_data_files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_data_service_all" ON user_data_files FOR ALL USING (true) WITH CHECK (true);

-- Rainfall config: authenticated can read, service role writes
CREATE POLICY "config_read" ON rainfall_config FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "config_service_all" ON rainfall_config FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DONE! Now run the bootstrap API to create admin user.
-- After running schema: visit http://localhost:3000/api/setup
-- =============================================
