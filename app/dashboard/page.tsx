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
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'graphical' | 'tabular' | 'leadtime' | 'verification' | 'hrv2' | 'map'>('graphical');
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const { config } = useRainfallConfig();
  const isMultiMode = config?.mode === 'multi';

  // Authentication check
  useEffect(() => {
    const authToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('auth_token='));
    
    if (!authToken) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Keyboard shortcut for admin panel (Ctrl+H or Cmd+H)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setIsAdminModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    localStorage.removeItem('imd_authenticated');
    localStorage.removeItem('imd_user');
    router.push('/login');
  };

  if (!isAuthenticated) {
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
              <span className="text-sm text-black font-bold">Welcome, IMD Mumbai</span>
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
          <nav className="flex space-x-8">
            {['upload', 'graphical', 'tabular', 'map', 'leadtime', 'verification', 'hrv2'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  if (tab === 'hrv2' && !isMultiMode) {
                    return; // Do not navigate; show inline warning
                  }
                  setActiveTab(tab as any);
                }}
                title={tab === 'hrv2' && !isMultiMode ? 'HRV-2 requires Multi Mode — change in Admin Panel' : undefined}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : tab === 'hrv2' && !isMultiMode
                    ? 'border-transparent text-gray-400 cursor-not-allowed'
                    : 'border-transparent text-black font-bold hover:text-blue-700 hover:border-gray-300'
                }`}
              >
                {tab === 'upload' && 'Upload Data'}
                {tab === 'graphical' && 'Graphical Analysis'}
                {tab === 'tabular' && 'Tabular Analysis'}
                {tab === 'map' && 'Map Analysis'}
                {tab === 'leadtime' && 'Lead-Time Verification'}
                {tab === 'verification' && 'HRV-1 (Heavy Rainfall)'}
                {tab === 'hrv2' && (
                  <span className="flex items-center gap-1">
                    HRV-2 (Category-wise)
                    {!isMultiMode && <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded ml-1">Multi Only</span>}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Tab */}
        {activeTab === 'upload' && <UploadForm />}

        {/* Graphical Analysis Tab */}
        {activeTab === 'graphical' && <AnalysisTab />}

        {/* Tabular Analysis Tab */}
        {activeTab === 'tabular' && <TabularAnalysisTab />}

        {/* Map Analysis Tab */}
        {activeTab === 'map' && <MapAnalysisTab />}

        {/* Lead-Time Verification Tab */}
        {activeTab === 'leadtime' && <LeadTimeVerificationTab />}

        {/* HRV-1 Verification Tab */}
        {activeTab === 'verification' && <HeavyRainfallVerificationTab />}

        {/* HRV-2 Verification Tab — only available in Multi Mode */}
        {activeTab === 'hrv2' && (
          isMultiMode
            ? <HRV2VerificationTab />
            : (
              <div className="bg-white rounded-xl border-2 border-amber-300 p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">HRV-2 Not Available in Dual Mode</h3>
                <p className="text-gray-600 mb-2 max-w-xl mx-auto">
                  HRV-2 (Category-wise Verification) evaluates Heavy, Very Heavy, and Extremely Heavy rainfall independently — these categories only exist in <strong>Multi Mode</strong>.
                </p>
                <p className="text-gray-500 text-sm">
                  To enable HRV-2, go to the <strong>Admin Panel</strong> (Ctrl+T) and switch to Multi Mode.
                </p>
              </div>
            )
        )}
      </div>

      {/* Admin Configuration Modal */}
      <AdminConfigModal 
        isOpen={isAdminModalOpen} 
        onClose={() => setIsAdminModalOpen(false)} 
      />

      {/* AI Research Chatbot - persists across all tabs */}
      <ChatbotWidget />
    </div>
  );
}
