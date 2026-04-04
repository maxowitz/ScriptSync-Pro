import { useState, useCallback, useRef } from 'react';
import { Upload, X, FileVideo, AlertCircle } from 'lucide-react';
import client from '../api/client';
import ProgressBar from './ProgressBar';
import * as tus from 'tus-js-client';

const ACCEPTED_EXTENSIONS = ['.mxf', '.mov', '.mp4', '.r3d'];
const ACCEPTED_MIME_TYPES = ['video/mxf', 'video/quicktime', 'video/mp4', 'video/x-red'];

function isAcceptedFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function FileUploadRow({ fileState, onRemove }) {
  const { file, progress, status, error } = fileState;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <FileVideo className="w-5 h-5 text-indigo-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700 truncate">
            {file.name}
          </span>
          <span className="text-xs text-gray-400 ml-2 shrink-0">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
        </div>
        {status === 'uploading' && (
          <ProgressBar percentage={progress} />
        )}
        {status === 'complete' && (
          <span className="text-xs text-green-600 font-medium">Upload complete</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-red-600">{error}</span>
        )}
        {status === 'pending' && (
          <span className="text-xs text-gray-400">Waiting...</span>
        )}
      </div>
      {(status === 'pending' || status === 'error') && (
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-gray-600"
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

  const addFiles = useCallback(
    (newFiles) => {
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
    },
    []
  );

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
            size: fileState.file.size,
            mimeType: fileState.file.type,
          }
        );

        // 2. Upload via tus
        await new Promise((resolve, reject) => {
          const upload = new tus.Upload(fileState.file, {
            endpoint: presignData.uploadUrl || presignData.url,
            metadata: {
              filename: fileState.file.name,
              filetype: fileState.file.type,
              clipId: presignData.clipId || presignData.clip?.id,
            },
            chunkSize: 50 * 1024 * 1024,
            retryDelays: [0, 1000, 3000, 5000],
            onProgress(bytesUploaded, bytesTotal) {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100);
              updateFile(fileState.id, { progress: pct });
            },
            onSuccess() {
              resolve();
            },
            onError(err) {
              reject(err);
            },
          });
          upload.start();
        });

        // 3. Confirm upload
        const clipId = presignData.clipId || presignData.clip?.id;
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
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${
            dragOver
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-300 bg-white hover:border-indigo-300 hover:bg-gray-50'
          }
        `}
      >
        <Upload
          className={`w-10 h-10 mx-auto mb-3 ${
            dragOver ? 'text-indigo-500' : 'text-gray-400'
          }`}
        />
        <p className="text-gray-700 font-medium">
          Drop files here or click to browse
        </p>
        <p className="text-gray-400 text-sm mt-1">
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
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
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
            <div className="flex justify-end mt-3">
              <button
                onClick={startUpload}
                disabled={uploading}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
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
