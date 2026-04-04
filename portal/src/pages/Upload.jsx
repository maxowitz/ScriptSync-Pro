import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Film,
  FileText,
  Users,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import client from '../api/client';
import useSocket from '../hooks/useSocket';
import UploadZone from '../components/UploadZone';
import ClipRow from '../components/ClipRow';

export default function Upload() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { joinProject, leaveProject, onEvent } = useSocket();

  const [project, setProject] = useState(null);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

    return () => {
      leaveProject(projectId);
      unsubs.forEach((unsub) => unsub());
    };
  }, [projectId, joinProject, leaveProject, onEvent]);

  const handleUploadComplete = (newClip) => {
    setClips((prev) => [newClip, ...prev]);
  };

  const handleRetry = async (clipId) => {
    try {
      await client.post(`/projects/${projectId}/clips/${clipId}/retry`);
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link
              to="/projects"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold">{project?.name || 'Project'}</h1>
          </div>
          {project && (
            <div className="flex items-center gap-4 ml-[4.25rem] text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                {clips.length} clips
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {project.memberCount ?? project.members?.length ?? 0} members
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              &times;
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clips</h2>

          {clips.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No clips uploaded yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Drag and drop files above to get started
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Shot
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Take
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploader
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
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
