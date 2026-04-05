import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Film,
  FileText,
  Users,
  Loader2,
  AlertCircle,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react';
import client from '../api/client';
import useSocket from '../hooks/useSocket';
import UploadZone from '../components/UploadZone';
import ClipRow from '../components/ClipRow';

export default function Upload() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { joinProject, leaveProject, onEvent, socket } = useSocket();

  const [project, setProject] = useState(null);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const [projRes, clipsRes] = await Promise.all([
        client.get(`/projects/${projectId}`),
        client.get(`/projects/${projectId}/clips`),
      ]);
      setProject(projRes.data.project || projRes.data);
      setClips(clipsRes.data.clips || clipsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Socket subscriptions
  useEffect(() => {
    if (!projectId) return;
    joinProject(projectId);

    const unsubs = [
      onEvent('connect', () => setSocketConnected(true)),
      onEvent('disconnect', () => setSocketConnected(false)),
      onEvent('clip:uploading-complete', (data) => {
        setClips((prev) =>
          prev.map((c) =>
            c.id === data.clipId ? { ...c, status: 'processing' } : c
          )
        );
      }),
      onEvent('clip:transcribed', (data) => {
        setClips((prev) =>
          prev.map((c) =>
            c.id === data.clipId ? { ...c, status: 'transcribed' } : c
          )
        );
      }),
      onEvent('clip:transcription-failed', (data) => {
        setClips((prev) =>
          prev.map((c) =>
            c.id === data.clipId
              ? { ...c, status: 'failed', error: data.error }
              : c
          )
        );
      }),
      onEvent('clip:mapped', (data) => {
        setClips((prev) =>
          prev.map((c) =>
            c.id === data.clipId ? { ...c, status: 'mapped' } : c
          )
        );
      }),
    ];

    // Check initial connection state
    if (socket?.connected) {
      setSocketConnected(true);
    }

    return () => {
      leaveProject(projectId);
      unsubs.forEach((unsub) => unsub());
    };
  }, [projectId, joinProject, leaveProject, onEvent, socket]);

  const handleUploadComplete = (newClip) => {
    setClips((prev) => [newClip, ...prev]);
  };

  const handleRetry = async (clipId) => {
    try {
      await client.post(`/projects/${projectId}/clips/${clipId}/retranscribe`);
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId ? { ...c, status: 'processing', error: null } : c
        )
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Retry failed');
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-primary, #0a0a0b)' }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent, #6366f1)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary, #0a0a0b)' }}>
      {/* Header */}
      <header
        className="border-b"
        style={{
          background: 'var(--bg-secondary, #111113)',
          borderColor: 'var(--border-primary, #2a2a30)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/projects"
                className="p-1.5 rounded-lg transition-all duration-200"
                style={{ color: 'var(--text-muted, #71717a)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-primary, #fafafa)';
                  e.currentTarget.style.background = 'var(--bg-hover, #222228)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted, #71717a)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/20">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1
                  className="text-lg font-bold tracking-tight"
                  style={{ color: 'var(--text-primary, #fafafa)' }}
                >
                  {project?.name || 'Project'}
                </h1>
                {project && (
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {clips.length} clips
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {project.memberCount ?? project.members?.length ?? 0} members
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Socket connection indicator */}
            <div className="flex items-center gap-2">
              {socketConnected ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#4ade80' }}>Live</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                  <span className="flex h-2 w-2">
                    <span className="inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#f87171' }}>Offline</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div
            className="mb-6 p-4 rounded-xl flex items-center gap-3 text-sm border"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400/60 hover:text-red-400 transition-colors duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload Zone */}
        <UploadZone
          projectId={projectId}
          onUploadComplete={handleUploadComplete}
        />

        {/* Clips Table */}
        <div className="mt-8">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: 'var(--text-primary, #fafafa)' }}
          >
            Clips
          </h2>

          {clips.length === 0 ? (
            <div
              className="text-center py-16 rounded-xl border"
              style={{
                background: 'var(--bg-card, #16161a)',
                borderColor: 'var(--border-primary, #2a2a30)',
              }}
            >
              <FileText
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: 'var(--text-muted, #71717a)' }}
              />
              <p style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
                No clips uploaded yet
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted, #71717a)' }}>
                Drag and drop files above to get started
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                background: 'var(--bg-card, #16161a)',
                borderColor: 'var(--border-primary, #2a2a30)',
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className="border-b"
                      style={{
                        background: 'var(--bg-card, #16161a)',
                        borderColor: 'var(--border-subtle, #1f1f25)',
                      }}
                    >
                      <th
                        className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                      >
                        Name
                      </th>
                      <th
                        className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                      >
                        Shot / Take
                      </th>
                      <th
                        className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                      >
                        Status
                      </th>
                      <th
                        className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                      >
                        Uploader
                      </th>
                      <th
                        className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                      >
                        Time
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {clips.map((clip) => (
                      <ClipRow
                        key={clip.id}
                        clip={clip}
                        onRetry={() => handleRetry(clip.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
