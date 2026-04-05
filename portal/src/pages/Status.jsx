import { useState, useEffect, useCallback, useMemo } from 'react';
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
import ProgressBar from '../components/ProgressBar';

function ConfidenceBadge({ score }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  let color = '#71717a';
  if (pct >= 80) color = '#4ade80';
  else if (pct >= 50) color = '#fbbf24';
  else color = '#f87171';
  return (
    <span className="text-xs font-mono ml-auto shrink-0" style={{ color }}>
      {pct}%
    </span>
  );
}

function MappingDot({ status }) {
  switch (status) {
    case 'approved':
      return (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--success, #22c55e)' }} />
        </span>
      );
    case 'pending':
      return (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--warning, #f59e0b)' }} />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--warning, #f59e0b)' }} />
        </span>
      );
    default:
      return (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--text-muted, #71717a)' }} />
        </span>
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
  const mappingLookup = useMemo(() => {
    const lookup = {};
    mappings.forEach((m) => {
      lookup[m.dialogueLineId || m.dialogue_line_id] = m;
    });
    return lookup;
  }, [mappings]);

  // Compute stats
  const scenes = screenplay?.scenes || [];
  const stats = useMemo(() => {
    let totalLines = 0;
    let mappedCount = 0;
    let pendingCount = 0;
    scenes.forEach((scene) => {
      (scene.dialogueLines || []).forEach((line) => {
        totalLines++;
        const mapping = mappingLookup[line.id];
        if (mapping) {
          if (mapping.approved) mappedCount++;
          else pendingCount++;
        }
      });
    });
    return { totalLines, mappedCount, pendingCount, unmappedCount: totalLines - mappedCount - pendingCount };
  }, [scenes, mappingLookup]);

  const progressPct = stats.totalLines > 0 ? Math.round((stats.mappedCount / stats.totalLines) * 100) : 0;

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
        <div className="max-w-7xl mx-auto px-6 py-4">
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
                {project?.name || 'Project'} &mdash; Status
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                Read-only overview
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
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
          </div>
        )}

        {!screenplay ? (
          <div className="text-center py-24">
            <FileText
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: 'var(--text-muted, #71717a)' }}
            />
            <p className="text-lg" style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
              No screenplay uploaded
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted, #71717a)' }}>
              A screenplay must be uploaded before status tracking is available
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Screenplay Structure (60%) */}
            <div className="lg:col-span-3">
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: 'var(--text-primary, #fafafa)' }}
              >
                Screenplay Structure
              </h2>
              <div
                className="rounded-xl border overflow-hidden"
                style={{
                  background: 'var(--bg-card, #16161a)',
                  borderColor: 'var(--border-primary, #2a2a30)',
                }}
              >
                {scenes.length === 0 ? (
                  <div className="p-8 text-center" style={{ color: 'var(--text-muted, #71717a)' }}>
                    No scenes parsed
                  </div>
                ) : (
                  scenes.map((scene, idx) => (
                    <div
                      key={scene.id}
                      className={idx < scenes.length - 1 ? 'border-b' : ''}
                      style={{ borderColor: 'var(--border-subtle, #1f1f25)' }}
                    >
                      <button
                        onClick={() => toggleScene(scene.id)}
                        className="w-full px-4 py-3.5 flex items-center gap-2.5 text-left transition-all duration-200"
                        style={{ background: 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #222228)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {expandedScenes[scene.id] ? (
                          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted, #71717a)' }} />
                        ) : (
                          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted, #71717a)' }} />
                        )}
                        <span
                          className="font-semibold text-sm"
                          style={{ color: 'var(--text-primary, #fafafa)' }}
                        >
                          {scene.heading || scene.title || `Scene ${scene.sceneNumber || scene.id}`}
                        </span>
                        <span
                          className="ml-auto text-xs"
                          style={{ color: 'var(--text-muted, #71717a)' }}
                        >
                          {scene.dialogueLines?.length || 0} lines
                        </span>
                      </button>
                      {expandedScenes[scene.id] && scene.dialogueLines && (
                        <div
                          className="px-4 pb-4 pl-11 space-y-1.5"
                        >
                          {scene.dialogueLines.map((line) => (
                            <div
                              key={line.id}
                              className="text-sm py-1.5 flex items-start gap-3"
                            >
                              <span
                                className="font-semibold uppercase text-xs min-w-[80px] pt-0.5"
                                style={{ color: 'var(--accent, #6366f1)' }}
                              >
                                {line.character}
                              </span>
                              <span style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
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

            {/* Right: Mapping Status (40%) */}
            <div className="lg:col-span-2">
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: 'var(--text-primary, #fafafa)' }}
              >
                Mapping Status
              </h2>

              {/* Stats Summary Card */}
              <div
                className="rounded-xl border p-5 mb-4"
                style={{
                  background: 'var(--bg-card, #16161a)',
                  borderColor: 'var(--border-primary, #2a2a30)',
                }}
              >
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: 'var(--success, #22c55e)' }}
                    >
                      {stats.mappedCount}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                      Mapped
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: 'var(--warning, #f59e0b)' }}
                    >
                      {stats.pendingCount}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                      Pending
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: 'var(--text-secondary, #a1a1aa)' }}
                    >
                      {stats.totalLines}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                      Total
                    </div>
                  </div>
                </div>
                <ProgressBar percentage={progressPct} label="Overall Progress" active={false} />
              </div>

              {/* Per-scene mapping */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{
                  background: 'var(--bg-card, #16161a)',
                  borderColor: 'var(--border-primary, #2a2a30)',
                }}
              >
                {scenes.length === 0 ? (
                  <div className="p-8 text-center" style={{ color: 'var(--text-muted, #71717a)' }}>
                    No mappings available
                  </div>
                ) : (
                  scenes.map((scene, idx) => (
                    <div
                      key={scene.id}
                      className={`p-4 ${idx < scenes.length - 1 ? 'border-b' : ''}`}
                      style={{ borderColor: 'var(--border-subtle, #1f1f25)' }}
                    >
                      <h3
                        className="text-sm font-medium mb-2.5"
                        style={{ color: 'var(--text-secondary, #a1a1aa)' }}
                      >
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
                                className="flex items-center gap-2.5 text-sm py-1"
                              >
                                <MappingDot status={status} />
                                <span
                                  className="font-medium uppercase text-xs min-w-[70px]"
                                  style={{ color: 'var(--accent, #6366f1)' }}
                                >
                                  {line.character}
                                </span>
                                <span
                                  className="truncate flex-1 text-xs"
                                  style={{ color: 'var(--text-muted, #71717a)' }}
                                >
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
                        <p className="text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                          No dialogue
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Legend */}
              <div className="mt-4 flex items-center gap-5 text-xs" style={{ color: 'var(--text-muted, #71717a)' }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--success, #22c55e)' }} />
                  Mapped
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--warning, #f59e0b)' }} />
                  Pending
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--text-muted, #71717a)' }} />
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
