export default function ProgressBar({ percentage = 0, label, active = true }) {
  const clamped = Math.max(0, Math.min(100, percentage));

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
            {label}
          </span>
          <span
            className="text-xs font-mono"
            style={{ color: 'var(--text-secondary, #a1a1aa)' }}
          >
            {clamped}%
          </span>
        </div>
      )}
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-elevated, #1c1c21)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
          style={{
            width: `${clamped}%`,
            background: 'linear-gradient(90deg, var(--accent, #6366f1), #818cf8)',
          }}
        >
          {/* Shimmer animation when active */}
          {active && clamped > 0 && clamped < 100 && (
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
          )}
        </div>
      </div>
      {!label && (
        <div className="text-right mt-1">
          <span
            className="text-xs font-mono"
            style={{ color: 'var(--text-muted, #71717a)' }}
          >
            {clamped}%
          </span>
        </div>
      )}

      {/* Inline keyframes for shimmer */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
