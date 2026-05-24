import { useSettingsStore } from '../../store/settingsStore';
import Button from '../shared/Button';
import Card from '../shared/Card';
import { useState } from 'react';
import { HiEye, HiEyeOff, HiCheck } from 'react-icons/hi';

export default function SettingsPanel() {
  const { settings, setApiKey, setProvider, setBaseUrl, setModel, setPomodoroWork, setPomodoroBreak, setPomodoroLongBreak, setDefaultSummaryType } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

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

  return (
    <div className="max-w-2xl space-y-6">
      <Card header={<h3 className="text-white font-semibold">🤖 AI Configuration</h3>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">API Key</label>
            <div className="flex gap-2">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Provider</label>
              <select value={settings.ai.provider} onChange={(e) => setProvider(e.target.value as any)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm">
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
        </div>
      </Card>

      <Card header={<h3 className="text-white font-semibold">⏱️ Pomodoro Settings</h3>}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Work (min)</label>
            <input type="number" value={settings.pomodoro.workDuration} onChange={(e) => setPomodoroWork(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Break (min)</label>
            <input type="number" value={settings.pomodoro.breakDuration} onChange={(e) => setPomodoroBreak(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Long Break (min)</label>
            <input type="number" value={settings.pomodoro.longBreakDuration} onChange={(e) => setPomodoroLongBreak(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm" />
          </div>
        </div>
      </Card>

      <Card header={<h3 className="text-white font-semibold">📝 Default Summary Type</h3>}>
        <div className="flex gap-3">
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
    </div>
  );
}
