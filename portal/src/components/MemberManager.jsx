import { useState, useEffect, useCallback } from 'react';
import { X, Users, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import client from '../api/client';
import InviteModal from './InviteModal';

const ROLE_OPTIONS = ['owner', 'editor', 'uploader', 'viewer'];

const ROLE_COLORS = {
  owner: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  uploader: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-700',
};

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
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
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

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No members</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold">
                    {(member.name || member.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {member.email}
                    </p>
                  </div>

                  {/* Role selector */}
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </option>
                    ))}
                  </select>

                  {/* Remove button */}
                  {confirmRemove === member.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRemove(member.id)}
                        className="text-xs text-red-600 font-medium hover:text-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(member.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => setShowInvite(true)}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
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
