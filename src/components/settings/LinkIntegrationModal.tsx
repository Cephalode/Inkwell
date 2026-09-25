import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import { HiXMark } from 'react-icons/hi2';
import Button from '../shared/Button';
import Card from '../shared/Card';
import { providerIcon } from '../../config/integrations';
import { linkIntegration } from '../../services/api/integrations';
import type { IntegrationStatus } from '../../types/integration';

interface LinkIntegrationModalProps {
  integration: IntegrationStatus;
  onClose: () => void;
  onLinked: () => void;
}

export default function LinkIntegrationModal({ integration, onClose, onLinked }: LinkIntegrationModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const Icon = providerIcon(integration.id); // lookup, not creation

  const submit = async () => {
    const missing = integration.fields.find((f) => !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }
    setLinking(true);
    setError('');
    try {
      await linkIntegration(integration.id, values);
      onLinked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
      setLinking(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Icon className="w-6 h-6 shrink-0 text-[var(--color-accent)]" />
                <div>
                  <h3 className="leading-tight" style={{ fontSize: 18 }}>{integration.label}</h3>
                  {integration.docsUrl && (
                    <a href={integration.docsUrl} target="_blank" rel="noreferrer" className="text-xs" style={{ color: 'var(--color-accent-700)' }}>
                      Get credentials
                    </a>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="shrink-0" style={{ opacity: 0.6 }} aria-label="Close">
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm" style={{ opacity: 0.6 }}>{integration.description}</p>

            {integration.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="block text-sm" style={{ opacity: 0.6 }}>{f.label}</label>
                <div className="relative">
                  <input
                    type={f.type === 'password' && !show[f.key] ? 'password' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="input pr-10"
                  />
                  {f.type === 'password' && (
                    <button
                      onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ opacity: 0.6 }}
                      type="button"
                      aria-label={show[f.key] ? 'Hide' : 'Show'}
                    >
                      {show[f.key] ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {f.help && <p className="text-xs" style={{ opacity: 0.5 }}>{f.help}</p>}
              </div>
            ))}

            {error && (
              <div
                className="px-3 py-2 text-sm"
                style={{
                  background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                  color: 'var(--color-danger)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={linking}>Cancel</Button>
              <Button onClick={submit} isLoading={linking}>Connect</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
