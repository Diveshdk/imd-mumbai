/**
 * Run this script to create Supabase tables + bootstrap admin user.
 * Usage: node scripts/setup.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocyfdurzwwtxnwisufji.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jeWZkdXJ6d3d0eG53aXN1ZmppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk3MDI1OSwiZXhwIjoyMDkyNTQ2MjU5fQ.A8CtL9b6TyJN5CU_vdOTHwkWHNMRO68GrE4sCDwYkTM';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runSQL(sql) {
  // Use the pg-meta API to run SQL
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });
  return response;
}

async function main() {
  console.log('🔧 Setting up Supabase tables...\n');

  // ── Create tables ──────────────────────────────────────────────────
  const tables = [
    {
      name: 'profiles',
      sql: `CREATE TABLE IF NOT EXISTS profiles (
        id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        username text UNIQUE NOT NULL,
        email text,
        role text CHECK (role IN ('admin', 'user')) DEFAULT 'user',
        status text CHECK (status IN ('pending', 'active', 'rejected')) DEFAULT 'pending',
        mode text CHECK (mode IN ('dual', 'multi')) DEFAULT 'dual',
        can_modify boolean DEFAULT false,
        can_delete boolean DEFAULT false,
        created_at timestamptz DEFAULT now()
      );`
    },
    {
      name: 'signup_requests',
      sql: `CREATE TABLE IF NOT EXISTS signup_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL,
        email text NOT NULL,
        status text CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        created_at timestamptz DEFAULT now()
      );`
    },
    {
      name: 'master_data_files',
      sql: `CREATE TABLE IF NOT EXISTS master_data_files (
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
      );`
    },
    {
      name: 'user_data_files',
      sql: `CREATE TABLE IF NOT EXISTS user_data_files (
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
      );`
    },
    {
      name: 'rainfall_config',
      sql: `CREATE TABLE IF NOT EXISTS rainfall_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        config jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );`
    }
  ];

  // Try creating tables by inserting a dummy row & seeing if table exists
  for (const table of tables) {
    // Check if table already exists by trying to select from it
    const { error } = await supabase.from(table.name).select('*').limit(1);
    if (!error) {
      console.log(`✅ Table '${table.name}' already exists`);
    } else if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
      console.log(`⚠️  Table '${table.name}' not found — needs SQL creation`);
    } else {
      console.log(`ℹ️  Table '${table.name}': ${error.message}`);
    }
  }

  console.log('\n📋 IMPORTANT: Run the following SQL in Supabase Dashboard > SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/ocyfdurzwwtxnwisufji/sql/new\n');
  console.log('Paste the contents of: scripts/supabase-schema.sql\n');

  // ── Bootstrap admin user ───────────────────────────────────────────
  console.log('👤 Bootstrapping admin user...');

  const adminEmail = 'shamburavindren@gmail.com';
  const adminPassword = 'imd@mumbai';
  const adminUsername = 'shamburavindren';

  const { data: listData } = await supabase.auth.admin.listUsers();
  const existingUser = listData?.users?.find(u => u.email === adminEmail);

  if (existingUser) {
    console.log(`✅ Auth user exists: ${adminEmail} (id: ${existingUser.id})`);

    // Check if profile exists
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, role').eq('id', existingUser.id).maybeSingle();

    if (profileError && profileError.message?.includes('schema cache')) {
      console.log('❌ profiles table does not exist — run the SQL schema first!');
    } else if (!profile) {
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: existingUser.id,
        username: adminUsername,
        email: adminEmail,
        role: 'admin',
        status: 'active',
        mode: 'multi',
        can_modify: true,
        can_delete: true,
      });
      if (insertErr) {
        console.log(`❌ Profile insert failed: ${insertErr.message}`);
      } else {
        console.log(`✅ Admin profile created!`);
      }
    } else {
      console.log(`✅ Admin profile exists (role: ${profile.role})`);
    }
  } else {
    // Create new auth user
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (createErr) {
      console.log(`❌ Auth user creation failed: ${createErr.message}`);
    } else {
      console.log(`✅ Auth user created: ${adminEmail} (id: ${newUser.user.id})`);

      const { error: insertErr } = await supabase.from('profiles').insert({
        id: newUser.user.id,
        username: adminUsername,
        email: adminEmail,
        role: 'admin',
        status: 'active',
        mode: 'multi',
        can_modify: true,
        can_delete: true,
      });

      if (insertErr) {
        console.log(`❌ Profile insert failed: ${insertErr.message}`);
        console.log(`   → Run the SQL schema first, then re-run this script`);
      } else {
        console.log(`✅ Admin profile created!`);
      }
    }
  }

  console.log('\n🎉 Setup script complete!');
  console.log('\nNext steps:');
  console.log('1. Run scripts/supabase-schema.sql in Supabase SQL Editor (if tables not created)');
  console.log('2. Re-run this script after creating tables to create admin profile');
  console.log('3. Visit http://localhost:3000/login');
  console.log('   Email: shamburavindren@gmail.com');
  console.log('   Password: imd@mumbai');
}

main().catch(console.error);
