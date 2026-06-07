import SettingsPanel from '../components/settings/SettingsPanel';

export default function SettingsPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">⚙️ Settings</h1>
        <p className="text-slate-400">Configure your study environment</p>
      </div>
      <SettingsPanel />
    </div>
  );
}
