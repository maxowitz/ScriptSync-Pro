import { useState } from 'react';
import { X, Send, AlertCircle, CheckCircle } from 'lucide-react';
import client from '../api/client';

const ROLE_OPTIONS = [
  { value: 'editor', label: 'Editor', desc: 'Can edit screenplay and mappings' },
  { value: 'uploader', label: 'Uploader', desc: 'Can upload clips' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access' },
];

export default function InviteModal({ projectId, onClose, onInvited }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('uploader');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await client.post(`/projects/${projectId}/invite`, { email, role });
      setSuccess(true);
      setTimeout(() => {
        onInvited?.();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Invite Member</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-gray-700 font-medium">Invitation sent!</p>
            <p className="text-gray-500 text-sm mt-1">
              An email has been sent to {email}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="colleague@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      role === opt.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={role === opt.value}
                      onChange={() => setRole(opt.value)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        role === opt.value
                          ? 'border-indigo-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {role === opt.value && (
                        <div className="w-2 h-2 bg-indigo-600 rounded-full" />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {opt.label}
                      </span>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
