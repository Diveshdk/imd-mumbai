'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import type { Profile, SignupRequest } from '@/lib/supabase/types';

type TabView = 'requests' | 'users' | 'data';

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>('requests');
  const [pendingRequests, setPendingRequests] = useState<SignupRequest[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ─── Auth gate ─────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
        toast.error('Admin access required');
        router.push('/dashboard');
        return;
      }

      setIsLoading(false);
      fetchRequests();
      fetchUsers();
    };
    check();
  }, []);

  // ─── Fetch data ────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    const res = await fetch('/api/admin/signup-requests');
    const data = await res.json();
    if (data.success) setPendingRequests(data.requests);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (data.success) setUsers(data.users.filter((u: Profile) => u.role !== 'admin'));
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────
  const handleRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    setUpdatingId(requestId);
    try {
      const res = await fetch('/api/admin/signup-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchRequests();
        fetchUsers();
      } else {
        toast.error(data.error);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUserUpdate = async (userId: string, updates: Partial<Profile>) => {
    setUpdatingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('User updated');
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...updates } : u))
        );
      } else {
        toast.error(data.error);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const tabs = [
    { id: 'requests' as TabView, label: `Pending Requests ${pendingRequests.length > 0 ? `(${pendingRequests.length})` : ''}` },
    { id: 'users' as TabView, label: 'User Management' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                ← Back to Dashboard
              </button>
              <span className="text-gray-300">|</span>
              <h1 className="text-lg font-bold text-gray-900">Admin Control Panel</h1>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">IMD Mumbai</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Pending Requests Tab */}
        {activeTab === 'requests' && (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Pending Sign-up Requests</h2>
            {pendingRequests.length === 0 ? (
              <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium">No pending requests</p>
                <p className="text-sm mt-1">All sign-up requests have been processed.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="bg-white rounded-lg border p-5 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="font-bold text-gray-900">{req.username}</p>
                      <p className="text-sm text-gray-500">{req.email}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Requested: {new Date(req.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        disabled={updatingId === req.id}
                        onClick={() => handleRequestAction(req.id, 'approve')}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition"
                      >
                        {updatingId === req.id ? '...' : '✓ Approve'}
                      </button>
                      <button
                        disabled={updatingId === req.id}
                        onClick={() => handleRequestAction(req.id, 'reject')}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-semibold rounded-lg transition"
                      >
                        {updatingId === req.id ? '...' : '✗ Reject'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">User Management</h2>
            {users.length === 0 ? (
              <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
                <p className="font-medium">No users yet</p>
                <p className="text-sm mt-1">Approved users will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {['User', 'Status', 'Mode', 'Can Modify', 'Can Delete'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{u.username}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            u.status === 'active' ? 'bg-green-100 text-green-700' :
                            u.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.mode}
                            disabled={updatingId === u.id || u.status !== 'active'}
                            onChange={(e) => handleUserUpdate(u.id, { mode: e.target.value as 'dual' | 'multi' })}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="dual">Dual Mode</option>
                            <option value="multi">Multi Mode</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <Toggle
                            value={u.can_modify}
                            disabled={updatingId === u.id || u.status !== 'active'}
                            onChange={(val) => handleUserUpdate(u.id, { can_modify: val })}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Toggle
                            value={u.can_delete}
                            disabled={updatingId === u.id || u.status !== 'active'}
                            onChange={(val) => handleUserUpdate(u.id, { can_delete: val })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        value ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
