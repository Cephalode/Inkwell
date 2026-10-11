import { useState } from 'react';
import Card from '../shared/Card';
import Button from '../shared/Button';
import { HiClipboard, HiCheck, HiWrenchScrewdriver } from 'react-icons/hi2';

/**
 * MCP section: Inkwell is itself an MCP server (POST /mcp, Streamable HTTP,
 * stateless). This panel mints a bearer token and shows paste-ready client
 * configs. Token = a normal Inkwell session, so Sign out / expiry revokes it.
 */
export default function McpSettings() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tools, setTools] = useState<{ name: string; description: string }[] | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const endpoint = `${origin}/mcp`;

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/mcp-token', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { token } = await res.json();
      setToken(token);
      const toolsRes = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      if (toolsRes.ok) {
        const json = await toolsRes.json();
        const list = json?.result?.tools;
        if (Array.isArray(list)) setTools(list.map((t: { name: string; description?: string }) => ({ name: t.name, description: t.description || '' })));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to mint token');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard denied — the config is visible for manual copy */ }
  };

  const config = JSON.stringify(
    {
      mcpServers: {
        inkwell: {
          type: 'http',
          url: endpoint,
          headers: { Authorization: `Bearer ${token ?? '<your-token>'}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="max-w-2xl w-full space-y-4 sm:space-y-6">
      <Card header={<h3 className="section-label" style={{ margin: 0 }}>MCP (Model Context Protocol)</h3>}>
        <div className="space-y-4">
          <p className="text-sm" style={{ opacity: 0.6, margin: 0 }}>
            Connect AI assistants like Claude to your Inkwell library. Inkwell runs an MCP server
            with {tools ? `${tools.length} ` : ''}tools for searching documents, tracking learning
            progress, and reviewing flashcards.
          </p>

          <div>
            <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Endpoint</label>
            <div className="flex gap-2">
              <input readOnly value={endpoint} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" onClick={() => void copy('endpoint', endpoint)}>
                {copied === 'endpoint' ? <HiCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <HiClipboard className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Access token</label>
            {token ? (
              <div className="flex gap-2">
                <input readOnly value={token} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" onClick={() => void copy('token', token)}>
                  {copied === 'token' ? <HiCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <HiClipboard className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <>
                <Button onClick={() => void generate()} isLoading={busy}>
                  <HiWrenchScrewdriver className="w-4 h-4" /> Generate token
                </Button>
                {err && <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }}>{err}</p>}
              </>
            )}
          </div>

          {token && (
            <div>
              <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Client configuration</label>
              <div className="relative">
                <pre className="input font-mono text-xs overflow-x-auto" style={{ whiteSpace: 'pre', padding: 'var(--space-3)' }}>{config}</pre>
                <button
                  onClick={() => void copy('config', config)}
                  className="absolute right-2 top-2 px-2 py-1 text-xs rounded"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)' }}
                >
                  {copied === 'config' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs mt-2" style={{ opacity: 0.5 }}>
                Paste into Claude Desktop's `claude_desktop_config.json` or any MCP client (type "http" / Streamable HTTP).
                Tokens expire after 30 days — generate a new one here anytime.
              </p>
            </div>
          )}

          {tools && (
            <div>
              <label className="block text-sm mb-1" style={{ opacity: 0.6 }}>Available tools</label>
              <div className="space-y-1">
                {tools.map((t) => (
                  <div key={t.name} className="flex gap-2 text-sm">
                    <span className="font-mono text-xs shrink-0" style={{ color: 'var(--color-accent)' }}>{t.name}</span>
                    <span className="text-xs" style={{ opacity: 0.6 }}>{t.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
