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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
            Invite Member
          </h3>
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

        {success ? (
          <div className="text-center py-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
              style={{ background: 'rgba(34, 197, 94, 0.12)' }}
            >
              <CheckCircle className="w-7 h-7" style={{ color: 'var(--success, #22c55e)' }} />
            </div>
            <p className="font-medium" style={{ color: 'var(--text-primary, #fafafa)' }}>
              Invitation sent!
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted, #71717a)' }}>
              An email has been sent to {email}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="p-3.5 rounded-xl flex items-center gap-3 text-sm border"
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

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary, #a1a1aa)' }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                placeholder="colleague@example.com"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-3"
                style={{ color: 'var(--text-secondary, #a1a1aa)' }}
              >
                Role
              </label>
              <div className="space-y-2.5">
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = role === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all duration-200"
                      style={{
                        borderColor: isSelected
                          ? 'var(--accent, #6366f1)'
                          : 'var(--border-primary, #2a2a30)',
                        background: isSelected
                          ? 'rgba(99, 102, 241, 0.06)'
                          : 'var(--bg-secondary, #111113)',
                        boxShadow: isSelected
                          ? '0 0 0 1px var(--accent, #6366f1), 0 0 12px rgba(99, 102, 241, 0.08)'
                          : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'var(--border-primary, #2a2a30)';
                          e.currentTarget.style.background = 'var(--bg-hover, #222228)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'var(--border-primary, #2a2a30)';
                          e.currentTarget.style.background = 'var(--bg-secondary, #111113)';
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={opt.value}
                        checked={isSelected}
                        onChange={() => setRole(opt.value)}
                        className="sr-only"
                      />
                      {/* Custom radio indicator */}
                      <div
                        className="w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200"
                        style={{
                          borderColor: isSelected
                            ? 'var(--accent, #6366f1)'
                            : 'var(--text-muted, #71717a)',
                          width: '18px',
                          height: '18px',
                        }}
                      >
                        {isSelected && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: 'var(--accent, #6366f1)' }}
                          />
                        )}
                      </div>
                      <div>
                        <span
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary, #fafafa)' }}
                        >
                          {opt.label}
                        </span>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted, #71717a)' }}>
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
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
                disabled={loading}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, var(--accent, #6366f1), #818cf8)',
                }}
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
