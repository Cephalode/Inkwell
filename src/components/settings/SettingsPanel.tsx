import { useSettingsStore } from '../../store/settingsStore';
import Button from '../shared/Button';
import Card from '../shared/Card';
import { useState, useEffect } from 'react';
import { HiEye, HiEyeOff, HiCheck, HiStatusOffline, HiStatusOnline } from 'react-icons/hi';
import { checkBackendHealth } from '../../services/ai/client';

export default function SettingsPanel() {
  const { settings, setApiKey, setProvider, setBaseUrl, setModel, setDefaultSummaryType, setShowWeekStats } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [useCustomKey, setUseCustomKey] = useState(!!settings.ai.apiKey);
  const [prevApiKey, setPrevApiKey] = useState(settings.ai.apiKey);

  // Check if the backend is reachable
  useEffect(() => {
    checkBackendHealth().then(setBackendOnline);
    const interval = setInterval(() => checkBackendHealth().then(setBackendOnline), 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync toggle with settings — adjust during render when the API key changes
  // externally (e.g. cleared by another part of the app).
  if (settings.ai.apiKey !== prevApiKey) {
    setPrevApiKey(settings.ai.apiKey);
    setUseCustomKey(!!settings.ai.apiKey);
  }

  const testApiKey = async () => {
    setTestStatus('testing');
    try {
      const res = await fetch(`${settings.ai.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${settings.ai.apiKey}` },
      });
      setTestStatus(res.ok ? 'ok' : 'fail');
    } catch { setTestStatus('fail'); }
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const handleToggleUseCustom = (useCustom: boolean) => {
    setUseCustomKey(useCustom);
    if (!useCustom) {
      // Clear the API key to switch back to built-in backend
      setApiKey('');
    }
  };

  return (
    <div className="max-w-2xl w-full space-y-4 sm:space-y-6">
      <Card header={<h3 className="text-white font-semibold">🤖 AI Configuration</h3>}>
        <div className="space-y-4">
          {/* Backend status indicator */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            backendOnline === null ? 'bg-slate-700 text-slate-400' :
            backendOnline ? 'bg-green-900/30 text-green-400 border border-green-800' :
            'bg-red-900/30 text-red-400 border border-red-800'
          }`}>
            {backendOnline === null && <HiStatusOffline className="w-4 h-4" />}
            {backendOnline === true && <HiStatusOnline className="w-4 h-4" />}
            {backendOnline === false && <HiStatusOffline className="w-4 h-4" />}
            {backendOnline === null && 'Checking backend...'}
            {backendOnline === true && 'Inkwell AI backend is running — no API key needed!'}
            {backendOnline === false && 'Backend not detected — enter a custom API key below'}
          </div>

          {/* Mode toggle */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">AI Source</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => handleToggleUseCustom(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  !useCustomKey
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                🔧 Built-in AI (GLM-5.1)
              </button>
              <button
                onClick={() => handleToggleUseCustom(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  useCustomKey
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                🔑 Custom API Key
              </button>
            </div>
          </div>

          {/* Custom API key section */}
          {useCustomKey && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">API Key</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={settings.ai.apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showKey ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button size="sm" onClick={testApiKey} isLoading={testStatus === 'testing'}>
                    {testStatus === 'ok' && <HiCheck className="w-4 h-4 text-green-400" />}
                    Test
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Provider</label>
                  <select value={settings.ai.provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'custom')} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm">
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Model</label>
                  <input value={settings.ai.model} onChange={(e) => setModel(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm" />
                </div>
              </div>
              {settings.ai.provider === 'custom' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Base URL</label>
                  <input value={settings.ai.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm" />
                </div>
              )}
            </>
          )}

          {!useCustomKey && (
            <p className="text-xs text-slate-500">
              Using the built-in Inkwell AI backend with GLM-5.1. The backend proxy runs on port 3002 and handles API authentication automatically.
            </p>
          )}
        </div>
      </Card>

      <Card header={<h3 className="text-white font-semibold">📝 Default Summary Type</h3>}>
        <div className="flex flex-wrap gap-3">
          {(['tldr', 'keypoints', 'detailed'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDefaultSummaryType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${settings.defaultSummaryType === t ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {t === 'tldr' ? 'TL;DR' : t === 'keypoints' ? 'Key Points' : 'Detailed'}
            </button>
          ))}
        </div>
      </Card>

      <Card header={<h3 className="text-white font-semibold">📅 Today Dashboard</h3>}>
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span>
            <span className="block text-sm text-slate-200">Show this-week stats</span>
            <span className="block text-xs text-slate-500 mt-0.5">Cards graded and study sessions from the last 7 days</span>
          </span>
          <button
            role="switch"
            aria-checked={settings.showWeekStats}
            onClick={() => setShowWeekStats(!settings.showWeekStats)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.showWeekStats ? 'bg-cyan-600' : 'bg-slate-700'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.showWeekStats ? 'translate-x-5' : ''}`}
            />
          </button>
        </label>
      </Card>
    </div>
  );
}
