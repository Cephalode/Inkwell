import { useSettingsStore } from '../../store/settingsStore';
import Button from '../shared/Button';
import Card from '../shared/Card';
import { useState, useEffect } from 'react';
import { HiEye, HiEyeOff, HiCheck, HiStatusOffline, HiStatusOnline } from 'react-icons/hi';
import { checkBackendHealth } from '../../services/ai/client';

export default function SettingsPanel() {
  const { settings, setApiKey, setProvider, setBaseUrl, setModel } = useSettingsStore();
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

  const statusStyle =
    backendOnline === null
      ? { background: 'var(--color-neutral-200)', opacity: 0.7 }
      : backendOnline
        ? {
            background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
            color: 'var(--color-success)',
            border: '1px solid color-mix(in srgb, var(--color-success) 35%, transparent)',
          }
        : {
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
            border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
          };

  return (
    <div className="max-w-2xl w-full space-y-4 sm:space-y-6">
      <Card header={<h3 className="section-label" style={{ margin: 0 }}>AI Configuration</h3>}>
        <div className="space-y-4">
          {/* Backend status indicator */}
          <div
            className="flex items-center gap-2 px-3 py-2 text-sm"
            style={{ borderRadius: 'var(--radius-md)', ...statusStyle }}
          >
            {backendOnline === null && <HiStatusOffline className="w-4 h-4" />}
            {backendOnline === true && <HiStatusOnline className="w-4 h-4" />}
            {backendOnline === false && <HiStatusOffline className="w-4 h-4" />}
            {backendOnline === null && 'Checking backend...'}
            {backendOnline === true && 'Inkwell AI backend is running — no API key needed!'}
            {backendOnline === false && 'Backend not detected — enter a custom API key below'}
          </div>

          {/* Mode toggle */}
          <div>
            <label className="block text-sm mb-2" style={{ opacity: 0.6 }}>AI Source</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => handleToggleUseCustom(false)}
                className={`btn ${!useCustomKey ? 'btn-primary' : 'btn-secondary'}`}
              >
                Built-in AI (GLM-5.1)
              </button>
              <button
                onClick={() => handleToggleUseCustom(true)}
                className={`btn ${useCustomKey ? 'btn-primary' : 'btn-secondary'}`}
              >
                Custom API Key
              </button>
            </div>
          </div>

          {/* Custom API key section */}
          {useCustomKey && (
            <>
              <div>
                <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>API Key</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={settings.ai.apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="input pr-10"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ opacity: 0.6 }}>
                      {showKey ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button size="sm" onClick={testApiKey} isLoading={testStatus === 'testing'}>
                    {testStatus === 'ok' && <HiCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} />}
                    Test
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Provider</label>
                  <select value={settings.ai.provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'custom')} className="input">
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Model</label>
                  <input value={settings.ai.model} onChange={(e) => setModel(e.target.value)} className="input" />
                </div>
              </div>
              {settings.ai.provider === 'custom' && (
                <div>
                  <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Base URL</label>
                  <input value={settings.ai.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input" />
                </div>
              )}
            </>
          )}

          {!useCustomKey && (
            <p className="text-xs" style={{ opacity: 0.5 }}>
              Using the built-in Inkwell AI backend with GLM-5.1. The backend proxy runs on port 3002 and handles API authentication automatically.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
