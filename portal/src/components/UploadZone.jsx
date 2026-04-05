import { useState, useCallback, useRef } from 'react';
import { Upload, X, FileVideo, AlertCircle, CheckCircle } from 'lucide-react';
import client from '../api/client';
import ProgressBar from './ProgressBar';

const ACCEPTED_EXTENSIONS = ['.mxf', '.mov', '.mp4', '.r3d'];

function isAcceptedFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function FileUploadRow({ fileState, onRemove }) {
  const { file, progress, status, error } = fileState;

  return (
    <div
      className="flex items-center gap-3 p-3.5 rounded-lg border transition-all duration-200"
      style={{
        background: 'var(--bg-secondary, #111113)',
        borderColor: 'var(--border-subtle, #1f1f25)',
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(99, 102, 241, 0.1)' }}
      >
        <FileVideo className="w-4 h-4" style={{ color: 'var(--accent, #6366f1)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary, #fafafa)' }}
          >
            {file.name}
          </span>
          <span
            className="text-xs ml-2 shrink-0"
            style={{ color: 'var(--text-muted, #71717a)' }}
          >
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
        </div>
        {status === 'uploading' && <ProgressBar percentage={progress} active />}
        {status === 'complete' && (
          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success, #22c55e)' }}>
            <CheckCircle className="w-3 h-3" />
            Upload complete
          </span>
        )}
        {status === 'error' && (
          <span className="text-xs" style={{ color: '#f87171' }}>{error}</span>
        )}
        {status === 'pending' && (
          <span className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
            Waiting...
          </span>
        )}
      </div>
      {(status === 'pending' || status === 'error') && (
        <button
          onClick={onRemove}
          className="p-1 rounded transition-all duration-200"
          style={{ color: 'var(--text-muted, #71717a)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #fafafa)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #71717a)')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function UploadZone({ projectId, onUploadComplete }) {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const addFiles = useCallback((newFiles) => {
    const valid = Array.from(newFiles).filter(isAcceptedFile);
    if (valid.length === 0) {
      setError('No valid video files. Accepted: ' + ACCEPTED_EXTENSIONS.join(', '));
      return;
    }
    setError(null);

    const entries = valid.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'pending',
      error: null,
    }));

    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleBrowse = () => fileInputRef.current?.click();

  const handleFileInput = (e) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (fileId) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const updateFile = (fileId, updates) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f))
    );
  };

  const startUpload = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    setUploading(true);
    setError(null);

    for (const fileState of pending) {
      try {
        // 1. Get presigned URL
        updateFile(fileState.id, { status: 'uploading', progress: 0 });

        const { data: presignData } = await client.post(
          `/projects/${projectId}/clips/presign`,
          {
            filename: fileState.file.name,
            contentType: fileState.file.type || 'application/octet-stream',
          }
        );

        const uploadUrl = presignData.uploadUrl || presignData.url;
        const clipId = presignData.clipId || presignData.clip?.id;

        // 2. Upload via XMLHttpRequest PUT to presigned URL (for progress tracking)
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl, true);
          xhr.setRequestHeader('Content-Type', fileState.file.type || 'application/octet-stream');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              updateFile(fileState.id, { progress: pct });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.onabort = () => reject(new Error('Upload aborted'));

          xhr.send(fileState.file);
        });

        // 3. Confirm upload
        const { data: confirmData } = await client.post(
          `/projects/${projectId}/clips/${clipId}/confirm-upload`
        );

        updateFile(fileState.id, { status: 'complete', progress: 100 });

        if (onUploadComplete) {
          onUploadComplete(confirmData.clip || confirmData);
        }
      } catch (err) {
        updateFile(fileState.id, {
          status: 'error',
          error: err.message || 'Upload failed',
        });
      }
    }

    setUploading(false);
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleBrowse}
        className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200"
        style={{
          borderColor: dragOver ? 'var(--accent, #6366f1)' : 'var(--border-primary, #2a2a30)',
          background: dragOver ? 'var(--bg-elevated, #1c1c21)' : 'var(--bg-secondary, #111113)',
          transform: dragOver ? 'scale(1.01)' : 'scale(1)',
        }}
        onMouseEnter={(e) => {
          if (!dragOver) {
            e.currentTarget.style.borderColor = 'var(--accent, #6366f1)';
            e.currentTarget.style.background = 'var(--bg-elevated, #1c1c21)';
          }
        }}
        onMouseLeave={(e) => {
          if (!dragOver) {
            e.currentTarget.style.borderColor = 'var(--border-primary, #2a2a30)';
            e.currentTarget.style.background = 'var(--bg-secondary, #111113)';
          }
        }}
      >
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: dragOver ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)' }}
        >
          <Upload
            className="w-6 h-6"
            style={{ color: dragOver ? 'var(--accent-hover, #818cf8)' : 'var(--accent, #6366f1)' }}
          />
        </div>
        <p className="font-medium" style={{ color: 'var(--text-primary, #fafafa)' }}>
          Drop files here or click to browse
        </p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted, #71717a)' }}>
          Accepts {ACCEPTED_EXTENSIONS.join(', ')} video files
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="mt-4 p-4 rounded-xl flex items-center gap-3 text-sm border"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.2)',
            color: '#fca5a5',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          {error}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((fileState) => (
            <FileUploadRow
              key={fileState.id}
              fileState={fileState}
              onRemove={() => removeFile(fileState.id)}
            />
          ))}

          {pendingCount > 0 && (
            <div className="flex justify-end mt-4">
              <button
                onClick={startUpload}
                disabled={uploading}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, var(--accent, #6366f1), #818cf8)',
                }}
              >
                <Upload className="w-4 h-4" />
                {uploading
                  ? 'Uploading...'
                  : `Upload ${pendingCount} file${pendingCount > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
