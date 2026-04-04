import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Film,
  Check,
  Clock,
  Minus,
  Loader2,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import client from '../api/client';
import useSocket from '../hooks/useSocket';

function ConfidenceBadge({ score }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  let color = 'text-gray-500';
  if (pct >= 80) color = 'text-green-600';
  else if (pct >= 50) color = 'text-yellow-600';
  else color = 'text-red-500';
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

function StatusIcon({ status }) {
  switch (status) {
    case 'approved':
      return (
        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-green-600" />
        </div>
      );
    case 'pending':
      return (
        <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center">
          <Clock className="w-3 h-3 text-yellow-600" />
        </div>
      );
    default:
      return (
        <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center">
          <Minus className="w-3 h-3 text-gray-400" />
        </div>
      );
  }
}

export default function Status() {
  const { id: projectId } = useParams();
  const { joinProject, leaveProject, onEvent } = useSocket();

  const [project, setProject] = useState(null);
  const [screenplay, setScreenplay] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedScenes, setExpandedScenes] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [projRes, screenplayRes, mappingsRes] = await Promise.all([
        client.get(`/projects/${projectId}`),
        client.get(`/projects/${projectId}/screenplay`).catch(() => ({ data: null })),
        client.get(`/projects/${projectId}/mappings`).catch(() => ({ data: [] })),
      ]);
      setProject(projRes.data.project || projRes.data);
      setScreenplay(screenplayRes.data?.screenplay || screenplayRes.data);
      setMappings(mappingsRes.data?.mappings || mappingsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load project status');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!projectId) return;
    joinProject(projectId);

    const unsubs = [
      onEvent('clip:mapped', () => fetchData()),
      onEvent('clip:transcribed', () => fetchData()),
    ];

    return () => {
      leaveProject(projectId);
      unsubs.forEach((u) => u());
    };
  }, [projectId, joinProject, leaveProject, onEvent, fetchData]);

  const toggleScene = (sceneId) => {
    setExpandedScenes((prev) => ({ ...prev, [sceneId]: !prev[sceneId] }));
  };

  // Build mapping lookup: dialogueLineId -> mapping
  const mappingLookup = {};
  mappings.forEach((m) => {
    mappingLookup[m.dialogueLineId || m.dialogue_line_id] = m;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const scenes = screenplay?.scenes || [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/projects"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">
                {project?.name || 'Project'} &mdash; Status
              </h1>
              <p className="text-sm text-gray-400">Read-only overview</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!screenplay ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No screenplay uploaded</p>
            <p className="text-gray-400 text-sm mt-1">
              A screenplay must be uploaded before status tracking is available
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Screenplay Structure */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Screenplay Structure
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {scenes.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No scenes parsed
                  </div>
                ) : (
                  scenes.map((scene) => (
                    <div key={scene.id}>
                      <button
                        onClick={() => toggleScene(scene.id)}
                        className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        {expandedScenes[scene.id] ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="font-medium text-gray-900 text-sm">
                          {scene.heading || scene.title || `Scene ${scene.sceneNumber || scene.id}`}
                        </span>
                        <span className="ml-auto text-xs text-gray-400">
                          {scene.dialogueLines?.length || 0} lines
                        </span>
                      </button>
                      {expandedScenes[scene.id] && scene.dialogueLines && (
                        <div className="px-4 pb-3 pl-10 space-y-1">
                          {scene.dialogueLines.map((line) => (
                            <div
                              key={line.id}
                              className="text-sm py-1 flex items-start gap-2"
                            >
                              <span className="font-medium text-gray-700 uppercase text-xs min-w-[80px]">
                                {line.character}
                              </span>
                              <span className="text-gray-500 truncate">
                                {line.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: Mapping Status */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Mapping Status
              </h2>
              <div className="bg-white rounded-xl border border-gray-200">
                {scenes.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No mappings available
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {scenes.map((scene) => (
                      <div key={scene.id} className="p-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">
                          {scene.heading || scene.title || `Scene ${scene.sceneNumber || scene.id}`}
                        </h3>
                        {scene.dialogueLines?.length > 0 ? (
                          <div className="space-y-2">
                            {scene.dialogueLines.map((line) => {
                              const mapping = mappingLookup[line.id];
                              const status = mapping
                                ? mapping.approved
                                  ? 'approved'
                                  : 'pending'
                                : 'unmapped';
                              return (
                                <div
                                  key={line.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <StatusIcon status={status} />
                                  <span className="font-medium text-gray-600 uppercase text-xs min-w-[80px]">
                                    {line.character}
                                  </span>
                                  <span className="text-gray-500 truncate flex-1">
                                    {line.text}
                                  </span>
                                  {mapping && (
                                    <ConfidenceBadge score={mapping.confidence} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No dialogue</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-100 rounded-full" />
                  Approved
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-yellow-100 rounded-full" />
                  Pending
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-100 rounded-full" />
                  Unmapped
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
