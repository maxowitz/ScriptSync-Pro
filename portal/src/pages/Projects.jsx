import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Film,
  Plus,
  Users,
  FileText,
  LogOut,
  FolderOpen,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import client from '../api/client';
import useAuth from '../hooks/useAuth';
import MemberManager from '../components/MemberManager';

export default function Projects() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create project modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Member manager
  const [managingProject, setManagingProject] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await client.get('/projects');
      setProjects(data.projects || data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await client.post('/projects', { name: newName });
      setShowCreate(false);
      setNewName('');
      fetchProjects();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleProjectClick = (project) => {
    const role = project.role || project.membership?.role;
    if (role === 'viewer') {
      navigate(`/projects/${project.id}/status`);
    } else {
      navigate(`/projects/${project.id}/upload`);
    }
  };

  const roleColor = (role) => {
    switch (role) {
      case 'owner':
        return 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/20';
      case 'editor':
        return 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20';
      case 'uploader':
        return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
      case 'viewer':
        return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20';
      default:
        return 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/20';
    }
  };

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
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <h1
              className="text-lg font-bold tracking-tight"
              style={{ color: 'var(--text-primary, #fafafa)' }}
            >
              ScriptSync Pro
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="text-sm"
              style={{ color: 'var(--text-secondary, #a1a1aa)' }}
            >
              {user?.name || user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
              style={{ color: 'var(--text-muted, #71717a)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #fafafa)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #71717a)')}
              title="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary, #fafafa)' }}
          >
            Projects
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, var(--accent, #6366f1), #818cf8)',
            }}
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>

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

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent, #6366f1)' }} />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <FolderOpen
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: 'var(--text-muted, #71717a)' }}
            />
            <p className="text-lg" style={{ color: 'var(--text-secondary, #a1a1aa)' }}>
              No projects yet
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted, #71717a)' }}>
              Create your first project to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const role = project.role || project.membership?.role || 'viewer';
              return (
                <div
                  key={project.id}
                  className="rounded-xl border cursor-pointer transition-all duration-200 hover:scale-[1.01] group"
                  style={{
                    background: 'var(--bg-card, #16161a)',
                    borderColor: 'var(--border-primary, #2a2a30)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent, #6366f1)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-primary, #2a2a30)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => handleProjectClick(project)}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <h3
                          className="font-semibold text-lg truncate"
                          style={{ color: 'var(--text-primary, #fafafa)' }}
                        >
                          {project.name}
                        </h3>
                      </div>
                      <span
                        className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 capitalize ${roleColor(role)}`}
                      >
                        {role}
                      </span>
                    </div>

                    {/* Status indicator */}
                    {project.status && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span
                          className="text-xs uppercase tracking-wider font-medium"
                          style={{ color: 'var(--success, #22c55e)' }}
                        >
                          {project.status}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted, #71717a)' }}>
                      <span className="flex items-center gap-1.5">
                        <Film className="w-4 h-4" />
                        {project._count?.clips ?? project.clipCount ?? 0} clips
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        {project._count?.members ?? project.memberCount ?? 0}
                      </span>
                    </div>
                  </div>

                  {role === 'owner' && (
                    <div
                      className="px-5 py-3 border-t"
                      style={{ borderColor: 'var(--border-subtle, #1f1f25)' }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagingProject(project);
                        }}
                        className="text-sm font-medium flex items-center gap-1.5 transition-all duration-200"
                        style={{ color: 'var(--accent, #6366f1)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover, #818cf8)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent, #6366f1)')}
                      >
                        <Users className="w-3.5 h-3.5" />
                        Manage Members
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="rounded-2xl w-full max-w-md p-6 mx-4 border shadow-2xl"
            style={{
              background: 'var(--bg-card, #16161a)',
              borderColor: 'var(--border-primary, #2a2a30)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-lg font-bold"
                style={{ color: 'var(--text-primary, #fafafa)' }}
              >
                Create Project
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg transition-all duration-200"
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
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="mb-5">
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-secondary, #a1a1aa)' }}
                >
                  Project Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200 outline-none"
                  style={{
                    background: 'var(--bg-elevated, #1c1c21)',
                    borderColor: 'var(--border-primary, #2a2a30)',
                    color: 'var(--text-primary, #fafafa)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent, #6366f1)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border-primary, #2a2a30)';
                    e.target.style.boxShadow = 'none';
                  }}
                  placeholder="My Film Project"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm rounded-lg transition-all duration-200"
                  style={{ color: 'var(--text-secondary, #a1a1aa)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-primary, #fafafa)';
                    e.currentTarget.style.background = 'var(--bg-hover, #222228)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary, #a1a1aa)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent, #6366f1), #818cf8)',
                  }}
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Manager Sidebar */}
      {managingProject && (
        <MemberManager
          project={managingProject}
          onClose={() => setManagingProject(null)}
        />
      )}
    </div>
  );
}
