import { PROVIDER_ICONS, FALLBACK_ICON } from './integrations';

/** Module-scope glyph so callers don't create components during render. */
export function ProviderGlyph({ id, className }: { id: string; className?: string }) {
  const Icon = PROVIDER_ICONS[id] ?? FALLBACK_ICON;
  return <Icon className={className} />;
}
