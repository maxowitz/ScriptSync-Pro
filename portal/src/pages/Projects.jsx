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
        return 'bg-purple-100 text-purple-700';
      case 'editor':
        return 'bg-blue-100 text-blue-700';
      case 'uploader':
        return 'bg-green-100 text-green-700';
      case 'viewer':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold">ScriptSync Pro</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user?.name || user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white transition-colors"
              title="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No projects yet</p>
            <p className="text-gray-400 text-sm mt-1">
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
                  className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleProjectClick(project)}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 text-lg truncate">
                        {project.name}
                      </h3>
                      <span
                        className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${roleColor(role)}`}
                      >
                        {role}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {project.memberCount ?? project.members?.length ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {project.clipCount ?? project.clips?.length ?? 0} clips
                      </span>
                    </div>
                    {project.status && (
                      <div className="mt-3">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">
                          {project.status}
                        </span>
                      </div>
                    )}
                  </div>
                  {role === 'owner' && (
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagingProject(project);
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Create Project</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="My Film Project"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
                >
                  {creating ? 'Creating...' : 'Create'}
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
