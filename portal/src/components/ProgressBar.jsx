export default function ProgressBar({ percentage = 0, label }) {
  const clamped = Math.max(0, Math.min(100, percentage));

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">{label}</span>
          <span className="text-xs text-gray-500 font-mono">{clamped}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-600 rounded-full transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {!label && (
        <div className="text-right mt-0.5">
          <span className="text-xs text-gray-400 font-mono">{clamped}%</span>
        </div>
      )}
    </div>
  );
}
