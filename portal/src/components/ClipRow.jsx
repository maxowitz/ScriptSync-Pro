import { RotateCcw } from 'lucide-react';

const STATUS_STYLES = {
  uploading: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  transcribed: 'bg-green-100 text-green-700',
  mapped: 'bg-purple-100 text-purple-700',
  failed: 'bg-red-100 text-red-700',
};

const STATUS_LABELS = {
  uploading: 'Uploading',
  processing: 'Processing',
  transcribed: 'Transcribed',
  mapped: 'Mapped',
  failed: 'Failed',
};

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ClipRow({ clip, onRetry }) {
  const status = clip.status || 'uploading';
  const styleClass = STATUS_STYLES[status] || STATUS_STYLES.uploading;
  const label = STATUS_LABELS[status] || status;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {clip.name || clip.filename}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {clip.shot || '--'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {clip.take || '--'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {clip.uploader?.name || clip.uploaderName || '--'}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${styleClass}`}
        >
          {label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(clip.createdAt || clip.uploadedAt)}
      </td>
      <td className="px-4 py-3">
        {status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-sm font-medium"
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
