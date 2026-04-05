import { useState, useEffect, useCallback } from 'react';
import { X, Users, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import client from '../api/client';
import InviteModal from './InviteModal';

const ROLE_OPTIONS = ['owner', 'editor', 'uploader', 'viewer'];

const ROLE_COLORS = {
  owner: { bg: 'rgba(99, 102, 241, 0.12)', text: '#818cf8', ring: 'rgba(99, 102, 241, 0.25)' },
  editor: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa', ring: 'rgba(59, 130, 246, 0.25)' },
  uploader: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', ring: 'rgba(245, 158, 11, 0.25)' },
  viewer: { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80', ring: 'rgba(34, 197, 94, 0.25)' },
};

const AVATAR_COLORS = [
  'from-indigo-500 to-purple-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-pink-500 to-rose-500',
];

function getAvatarColor(name) {
  const idx = (name || '').charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function MemberManager({ project, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await client.get(`/projects/${project.id}/members`);
      setMembers(data.members || data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await client.patch(`/projects/${project.id}/members/${memberId}`, {
        role: newRole,
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleRemove = async (memberId) => {
    try {
      await client.delete(`/projects/${project.id}/members/${memberId}`);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setConfirmRemove(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove member');
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col border-l"
        style={{
          background: 'var(--bg-card, #16161a)',
          borderColor: 'var(--border-primary, #2a2a30)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-primary, #2a2a30)' }}
        >
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5" style={{ color: 'var(--accent, #6366f1)' }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary, #fafafa)' }}
            >
              Members
            </h2>
          </div>
          <button
            onClick={onClose}
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
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-6 mt-4 p-3.5 rounded-xl flex items-center gap-3 text-sm border"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400/60 hover:text-red-400 transition-colors duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent, #6366f1)' }} />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center py-16" style={{ color: 'var(--text-muted, #71717a)' }}>
              No members
            </p>
          ) : (
            <div className="space-y-2.5">
              {members.map((member) => {
                const displayName = member.name || member.email || '?';
                const roleStyle = ROLE_COLORS[member.role] || ROLE_COLORS.viewer;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200"
                    style={{
                      background: 'var(--bg-secondary, #111113)',
                      borderColor: 'var(--border-subtle, #1f1f25)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary, #2a2a30)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle, #1f1f25)')}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${getAvatarColor(displayName)} shrink-0`}
                    >
                      {displayName[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--text-primary, #fafafa)' }}
                      >
                        {member.name || 'Unnamed'}
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                      >
                        {member.email}
                      </p>
                    </div>

                    {/* Role selector */}
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      className="text-xs rounded-lg px-2.5 py-1.5 border outline-none transition-all duration-200 cursor-pointer appearance-none"
                      style={{
                        background: 'var(--bg-elevated, #1c1c21)',
                        borderColor: 'var(--border-primary, #2a2a30)',
                        color: 'var(--text-secondary, #a1a1aa)',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--accent, #6366f1)';
                        e.target.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'var(--border-primary, #2a2a30)';
                        e.target.style.boxShadow = 'none';
                      }}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>

                    {/* Remove button */}
                    {confirmRemove === member.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRemove(member.id)}
                          className="text-xs font-medium px-2 py-1 rounded transition-all duration-200"
                          style={{ color: '#f87171' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="text-xs px-2 py-1 rounded transition-all duration-200"
                          style={{ color: 'var(--text-muted, #71717a)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--text-secondary, #a1a1aa)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-muted, #71717a)';
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(member.id)}
                        className="p-1.5 rounded-lg transition-all duration-200"
                        style={{ color: 'var(--text-muted, #71717a)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#f87171';
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-muted, #71717a)';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t"
          style={{ borderColor: 'var(--border-primary, #2a2a30)' }}
        >
          <button
            onClick={() => setShowInvite(true)}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, var(--accent, #6366f1), #818cf8)',
            }}
          >
            Invite Member
          </button>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          projectId={project.id}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            fetchMembers();
          }}
        />
      )}
    </>
  );
}
