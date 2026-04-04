import { useState, useCallback, useRef } from 'react';
import * as tus from 'tus-js-client';

export default function useTusUpload({ presignedUrl, file, metadata, onSuccess }) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const uploadRef = useRef(null);

  const upload = useCallback(() => {
    if (!presignedUrl || !file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    const tusUpload = new tus.Upload(file, {
      endpoint: presignedUrl,
      metadata: metadata || {},
      chunkSize: 50 * 1024 * 1024, // 50MB
      retryDelays: [0, 1000, 3000, 5000],
      onProgress(bytesUploaded, bytesTotal) {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        setProgress(pct);
      },
      onSuccess() {
        setUploading(false);
        setProgress(100);
        onSuccess?.();
      },
      onError(err) {
        setUploading(false);
        setError(err.message || 'Upload failed');
      },
    });

    uploadRef.current = tusUpload;
    tusUpload.start();
  }, [presignedUrl, file, metadata, onSuccess]);

  const abort = useCallback(() => {
    uploadRef.current?.abort();
    setUploading(false);
  }, []);

  return { progress, uploading, error, upload, abort };
}
