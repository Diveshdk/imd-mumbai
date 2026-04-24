'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import UploadForm from './components/UploadForm';
import HeavyRainfallVerificationTab from './components/HeavyRainfallVerificationTab';
import HRV2VerificationTab from './components/HRV2VerificationTab';
import LeadTimeVerificationTab from './LeadTimeVerificationTab';
import AnalysisTab from './components/AnalysisTab';
import TabularAnalysisTab from './components/TabularAnalysisTab';
import AdminConfigModal from './components/AdminConfigModal';
import MapAnalysisTab from './components/MapAnalysisTab';
import ChatbotWidget from './components/ChatbotWidget';
import DataFilesTab from './components/DataFilesTab';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/supabase/types';

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'graphical' | 'tabular' | 'leadtime' | 'verification' | 'hrv2' | 'map' | 'datafiles'>('map');
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  
  // Shared context states for synchronization
  const [startDate, setStartDate] = useState<string>('2025-06-01');
  const [endDate, setEndDate] = useState<string>('2025-06-30');
  const [selectedDate, setSelectedDate] = useState<string | null>('2025-06-01');
  const [selectedMonth, setSelectedMonth] = useState<string>('2025-06');
  const { config } = useRainfallConfig();

  const supabase = createClient();

  // Determine mode from the profile for users, or system config for admin
  // This ensures that the user's personal assignment (Dual or Multi) is respected
  const isMultiMode = profile?.role === 'admin'
    ? config?.mode === 'multi'
    : profile?.mode === 'multi';

  const isAdmin = profile?.role === 'admin';

  // ─── Auth & Profile load ──────────────────────────────────────────
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profileData || profileData.status !== 'active') {
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      setProfile(profileData as Profile);
      setIsAuthenticated(true);
    };

    loadUser();
  }, [router]);

  // ─── Keyboard shortcut — admin and authorized users ────────────────
  useEffect(() => {
    const canAccessConfig = isAdmin || profile?.can_modify || profile?.can_delete;
    if (!canAccessConfig) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setIsAdminModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin, profile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleResetData = async () => {
    if (!confirm('Are you sure you want to reset all your personal data modifications? This will revert your view to the Admin\'s master files.')) return;
    
    try {
      const res = await fetch('/api/auth/reset-data', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        // Reload page to clear caches and show fresh master data
        window.location.reload();
      } else {
        toast.error(data.error || 'Reset failed');
      }
    } catch {
      toast.error('Failed to reset data');
    }
  };

  if (!isAuthenticated || !profile) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">IMD Mumbai</h1>
              <div className="ml-4 text-sm text-black font-bold">
                Rainfall Forecast Verification Dashboard
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-black font-bold">
                Welcome, {profile.username}
                {isAdmin && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Admin</span>}
                {!isAdmin && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isMultiMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isMultiMode ? 'Multi Mode' : 'Dual Mode'}
                  </span>
                )}
              </span>
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-semibold"
                >
                  Admin Panel
                </button>
              )}
              {!isAdmin && (profile.can_modify || profile.can_delete) && (
                <button
                  onClick={handleResetData}
                  className="border border-amber-300 text-amber-700 hover:bg-amber-50 px-3 py-1 rounded text-sm font-semibold flex items-center gap-1.5 transition-colors"
                  title="Revert all your modifications back to admin master files"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset Data
                </button>
              )}
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 overflow-x-auto">
            {['upload', 'graphical', 'tabular', 'map', 'leadtime', 'verification'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-black font-bold hover:text-blue-700 hover:border-gray-300'
                }`}
              >
                {tab === 'upload' && 'Upload Data'}
                {tab === 'graphical' && 'Graphical Analysis'}
                {tab === 'tabular' && 'Tabular Analysis'}
                {tab === 'map' && 'Map Analysis'}
                {tab === 'leadtime' && 'Lead-Time Verification'}
                {tab === 'verification' && 'HRV-1 (Heavy Rainfall)'}
              </button>
            ))}
            {/* HRV-2 only visible when multi-mode is active */}
            {isMultiMode && (
              <button
                onClick={() => setActiveTab('hrv2')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'hrv2'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-black font-bold hover:text-blue-700 hover:border-gray-300'
                }`}
              >
                HRV-2 (Category-wise)
              </button>
            )}
            {/* Admin or Authorized: Data Files tab */}
            {(isAdmin || profile.can_modify || profile.can_delete) && (
              <button
                onClick={() => setActiveTab('datafiles')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'datafiles'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-indigo-500 font-bold hover:text-indigo-700 hover:border-indigo-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Data Files
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'upload' && <UploadForm isAdmin={isAdmin} canModify={profile.can_modify} />}
        {activeTab === 'graphical' && (
          <AnalysisTab 
            mode={isMultiMode ? 'multi' : 'dual'} 
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
          />
        )}
        {activeTab === 'tabular' && (
          <TabularAnalysisTab 
            mode={isMultiMode ? 'multi' : 'dual'} 
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
          />
        )}
        {activeTab === 'map' && (
          <MapAnalysisTab 
            mode={isMultiMode ? 'multi' : 'dual'} 
            selectedDate={selectedDate} setSelectedDate={setSelectedDate}
            selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
          />
        )}
        {activeTab === 'leadtime' && (
          <LeadTimeVerificationTab 
            mode={isMultiMode ? 'multi' : 'dual'} 
            selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          />
        )}
        {activeTab === 'verification' && (
          <HeavyRainfallVerificationTab 
            mode={isMultiMode ? 'multi' : 'dual'} 
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
          />
        )}
        {activeTab === 'hrv2' && isMultiMode && (
          <HRV2VerificationTab 
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
          />
        )}
        {activeTab === 'datafiles' && (isAdmin || profile.can_modify || profile.can_delete) && <DataFilesTab />}
      </div>

      {/* Configuration Modal — admin and authorized users */}
      {(isAdmin || profile.can_modify || profile.can_delete) && (
        <AdminConfigModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
        />
      )}

      {/* AI Research Chatbot */}
      <ChatbotWidget />
    </div>
  );
}
