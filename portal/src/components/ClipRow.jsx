import { RotateCcw, Check, X as XIcon, Loader2 } from 'lucide-react';

function StatusBadge({ status }) {
  const configs = {
    uploading: {
      bg: 'rgba(59, 130, 246, 0.12)',
      text: '#60a5fa',
      ring: 'rgba(59, 130, 246, 0.25)',
      label: 'Uploading',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    processing: {
      bg: 'rgba(245, 158, 11, 0.12)',
      text: '#fbbf24',
      ring: 'rgba(245, 158, 11, 0.25)',
      label: 'Processing',
      icon: (
        <span className="relative flex h-2 w-2">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: '#fbbf24' }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: '#fbbf24' }}
          />
        </span>
      ),
    },
    transcribing: {
      bg: 'rgba(245, 158, 11, 0.12)',
      text: '#fbbf24',
      ring: 'rgba(245, 158, 11, 0.25)',
      label: 'Transcribing',
      icon: (
        <span className="relative flex h-2 w-2">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: '#fbbf24' }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: '#fbbf24' }}
          />
        </span>
      ),
    },
    transcribed: {
      bg: 'rgba(34, 197, 94, 0.12)',
      text: '#4ade80',
      ring: 'rgba(34, 197, 94, 0.25)',
      label: 'Transcribed',
      icon: <Check className="w-3 h-3" />,
    },
    mapped: {
      bg: 'rgba(99, 102, 241, 0.12)',
      text: '#818cf8',
      ring: 'rgba(99, 102, 241, 0.25)',
      label: 'Mapped',
      icon: <Check className="w-3 h-3" />,
    },
    failed: {
      bg: 'rgba(239, 68, 68, 0.12)',
      text: '#f87171',
      ring: 'rgba(239, 68, 68, 0.25)',
      label: 'Failed',
      icon: <XIcon className="w-3 h-3" />,
    },
  };

  const config = configs[status] || configs.uploading;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        background: config.bg,
        color: config.text,
        boxShadow: `inset 0 0 0 1px ${config.ring}`,
      }}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '--';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function ClipRow({ clip, onRetry }) {
  const status = clip.status || 'uploading';

  return (
    <tr
      className="transition-all duration-200"
      style={{ background: 'var(--bg-secondary, #111113)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #222228)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-secondary, #111113)')}
    >
      <td className="px-4 py-3.5">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary, #fafafa)' }}>
          {clip.name || clip.filename}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-sm" style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
          {clip.shot ? `${clip.shot}` : '--'}
          {clip.take ? ` / T${clip.take}` : ''}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={status} />
      </td>
      <td className="px-4 py-3.5">
        <span className="text-sm" style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
          {clip.uploader?.name || clip.uploaderName || '--'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-sm" style={{ color: 'var(--text-muted, #71717a)' }}>
          {formatRelativeTime(clip.createdAt || clip.uploadedAt)}
        </span>
      </td>
      <td className="px-4 py-3.5">
        {status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              color: 'var(--text-secondary, #a1a1aa)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary, #fafafa)';
              e.currentTarget.style.background = 'var(--bg-elevated, #1c1c21)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary, #a1a1aa)';
              e.currentTarget.style.background = 'transparent';
            }}
            title="Retry transcription"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </td>
    </tr>
  );
}
