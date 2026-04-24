'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';

type View = 'login' | 'signup';

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Login state
  const [loginCreds, setLoginCreds] = useState({ email: '', password: '' });

  // Sign-up state
  const [signupData, setSignupData] = useState({ email: '', password: '', username: '' });

  // ─── Login ───────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginCreds.email,
        password: loginCreds.password,
      });

      if (error) {
        toast.error(error.message || 'Invalid credentials');
        return;
      }

      // Check profile status
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Login failed'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', user.id)
        .single();

      if (!profile) {
        await supabase.auth.signOut();
        toast.error('Account profile not found. Please contact admin.');
        return;
      }

      if (profile.status === 'pending') {
        await supabase.auth.signOut();
        toast.error('Your account is pending approval. Please wait for admin to approve your request.');
        return;
      }

      if (profile.status === 'rejected') {
        await supabase.auth.signOut();
        toast.error('Your account request was rejected. Please contact admin.');
        return;
      }

      toast.success('Login successful!');
      if (profile.role === 'admin') {
        router.push('/dashboard');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Sign-up request ─────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupData),
      });

      const result = await res.json();

      if (!result.success) {
        toast.error(result.error || 'Sign-up failed');
        return;
      }

      toast.success('Request submitted! Admin will review your account shortly.');
      setView('login');
      setSignupData({ email: '', password: '', username: '' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* IMD Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Indian Meteorological Department
          </h1>
          <p className="text-xl text-black font-bold">Mumbai Regional Centre</p>
          <p className="text-sm text-black font-bold mt-2 italic">Rainfall Forecast Verification System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {view === 'login' ? (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">System Login</h2>

              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={loginCreds.email}
                    onChange={(e) => setLoginCreds((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter email"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={loginCreds.password}
                    onChange={(e) => setLoginCreds((p) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition duration-200"
                >
                  {isLoading ? 'Authenticating...' : 'Login'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => setView('signup')}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Request Access
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">Request Account Access</h2>
              <p className="text-sm text-gray-500 text-center mb-6">
                Your request will be reviewed by the admin before you can log in.
              </p>

              <form onSubmit={handleSignup} className="space-y-5">
                <div>
                  <label htmlFor="su-username" className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <input
                    id="su-username"
                    type="text"
                    required
                    minLength={3}
                    value={signupData.username}
                    onChange={(e) => setSignupData((p) => ({ ...p, username: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Choose a username"
                  />
                </div>

                <div>
                  <label htmlFor="su-email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="su-email"
                    type="email"
                    required
                    value={signupData.email}
                    onChange={(e) => setSignupData((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label htmlFor="su-password" className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    id="su-password"
                    type="password"
                    required
                    minLength={6}
                    value={signupData.password}
                    onChange={(e) => setSignupData((p) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Create a password (min 6 chars)"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-md transition duration-200"
                >
                  {isLoading ? 'Submitting...' : 'Submit Access Request'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setView('login')}
                  className="text-sm text-blue-600 hover:underline"
                >
                  ← Back to Login
                </button>
              </div>
            </>
          )}

          <div className="mt-8 text-center text-xs text-black font-bold border-t pt-4">
            For official use only • Government of India
          </div>
        </div>
      </div>
    </div>
  );
}
