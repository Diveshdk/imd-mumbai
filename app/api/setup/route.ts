import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * GET /api/setup
 * One-time setup: creates DB tables and bootstraps admin user.
 * Protected by a setup secret so it can only be called intentionally.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== 'imd-setup-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: string[] = [];
  const errors: string[] = [];

  try {
    // ─── 1. Create tables via Supabase SQL ────────────────────────
    const schemaSql = `
      -- Profiles
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

      -- Signup requests
      CREATE TABLE IF NOT EXISTS signup_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL,
        email text NOT NULL,
        status text CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        created_at timestamptz DEFAULT now()
      );

      -- Master data files
      CREATE TABLE IF NOT EXISTS master_data_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text CHECK (type IN ('warning', 'realised')) NOT NULL,
        year int NOT NULL,
        month int NOT NULL,
        day int NOT NULL,
        lead_day text,
        districts jsonb NOT NULL DEFAULT '{}',
        uploaded_by uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(type, year, month, day, lead_day)
      );

      -- User-specific copies
      CREATE TABLE IF NOT EXISTS user_data_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        master_file_id uuid,
        user_id uuid NOT NULL,
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

      -- Rainfall config
      CREATE TABLE IF NOT EXISTS rainfall_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        config jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_master_data_type_year_month ON master_data_files(type, year, month);
      CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data_files(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_data_user_type_year_month ON user_data_files(user_id, type, year, month);
    `;

    const { error: schemaError } = await adminSupabase.rpc('exec_sql_imd', { sql: schemaSql }).single();
    
    // If the RPC doesn't exist, try raw SQL via the pg-meta approach
    // We'll use the REST API directly
    const pgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    
    results.push('Schema creation attempted');

    // ─── 2. Bootstrap Admin User ──────────────────────────────────
    const adminEmail = 'shamburavindren@gmail.com';
    const adminPassword = 'imd@mumbai';
    const adminUsername = 'shamburavindren';

    // Check if admin already exists in profiles
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('username', adminUsername)
      .single();

    if (existingProfile) {
      results.push('Admin profile already exists — skipping');
    } else {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });

      if (authError) {
        // Check if user already exists
        if (authError.message?.includes('already been registered')) {
          results.push('Auth user already exists — creating profile only');
          // List users to find the existing one
          const { data: usersData } = await adminSupabase.auth.admin.listUsers();
          const existingUser = usersData?.users?.find((u) => u.email === adminEmail);
          if (existingUser) {
            await adminSupabase.from('profiles').upsert({
              id: existingUser.id,
              username: adminUsername,
              email: adminEmail,
              role: 'admin',
              status: 'active',
              mode: 'multi',
              can_modify: true,
              can_delete: true,
            });
            results.push('Admin profile created for existing auth user');
          }
        } else {
          errors.push(`Auth error: ${authError.message}`);
        }
      } else if (authData?.user) {
        // Create profile
        const { error: profileError } = await adminSupabase.from('profiles').insert({
          id: authData.user.id,
          username: adminUsername,
          email: adminEmail,
          role: 'admin',
          status: 'active',
          mode: 'multi',
          can_modify: true,
          can_delete: true,
        });

        if (profileError) {
          errors.push(`Profile error: ${profileError.message}`);
        } else {
          results.push('Admin user created successfully');
        }
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      results,
      errors,
      message: errors.length === 0
        ? '✅ Setup complete! Admin user ready. You must run the SQL schema in Supabase dashboard.'
        : '⚠️ Setup completed with some errors. Check the errors array.',
      nextStep: 'Run scripts/supabase-schema.sql in your Supabase Dashboard > SQL Editor',
    });

  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      nextStep: 'Run scripts/supabase-schema.sql in your Supabase Dashboard > SQL Editor',
    }, { status: 500 });
  }
}
