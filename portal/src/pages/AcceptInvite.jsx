import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Film, AlertCircle, CheckCircle, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import client from '../api/client';

const roleBadgeStyles = {
  editor: {
    backgroundColor: 'rgba(99,102,241,0.12)',
    color: '#818cf8',
    border: '1px solid rgba(99,102,241,0.25)',
  },
  uploader: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    color: '#fbbf24',
    border: '1px solid rgba(245,158,11,0.25)',
  },
  viewer: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    color: '#4ade80',
    border: '1px solid rgba(34,197,94,0.25)',
  },
};

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }

    client
      .get(`/invites/validate?token=${token}`)
      .then(({ data }) => setInvite(data))
      .catch((err) =>
        setError(err.response?.data?.error || 'Invalid or expired invitation')
      )
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = { token };
      if (!invite?.userExists) {
        payload.name = name;
        payload.password = password;
      }

      const { data } = await client.post('/invites/accept', payload);

      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      const projectId = invite?.projectId || data.projectId;
      const role = invite?.role || data.role;

      if (role === 'uploader') {
        navigate(`/projects/${projectId}/upload`);
      } else {
        navigate('/projects');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const inputFocusHandlers = {
    onFocus: (e) => {
      e.target.style.borderColor = 'var(--accent)';
      e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)';
    },
    onBlur: (e) => {
      e.target.style.borderColor = 'var(--border-primary)';
      e.target.style.boxShadow = 'none';
    },
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, #0a0a0b 70%)',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div className="flex items-center gap-3">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: 'var(--accent)' }}
          />
          <span
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Validating invitation...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, #0a0a0b 70%)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <div className="w-full max-w-[420px]">
        {/* Glass card */}
        <div
          className="rounded-2xl p-8 sm:p-10"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.03), 0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
              }}
            >
              <Film className="w-7 h-7 text-white" />
            </div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              ScriptSync Pro
            </h1>
            <p
              className="mt-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              You&apos;ve been invited
            </p>
          </div>

          {/* Error without invite (invalid token) */}
          {error && !invite && (
            <div className="text-center">
              <div
                className="p-4 rounded-xl flex flex-col items-center gap-3 text-sm"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: 'var(--danger)',
                }}
              >
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
              <Link
                to="/login"
                className="inline-block mt-6 text-sm font-medium transition-colors duration-150 hover:opacity-90"
                style={{ color: 'var(--accent)' }}
              >
                Back to login
              </Link>
            </div>
          )}

          {invite && (
            <>
              {/* Invite details */}
              <div
                className="mb-6 p-5 rounded-xl text-center"
                style={{
                  backgroundColor: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.12)',
                }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  You&apos;re invited to join
                </p>
                <p
                  className="text-lg font-bold mt-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {invite.projectName}
                </p>
                <span
                  className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
                  style={
                    roleBadgeStyles[invite.role?.toLowerCase()] || {
                      backgroundColor: 'rgba(99,102,241,0.12)',
                      color: '#818cf8',
                      border: '1px solid rgba(99,102,241,0.25)',
                    }
                  }
                >
                  {invite.role}
                </span>
              </div>

              {/* Error during submission */}
              {error && (
                <div
                  className="mb-6 p-3.5 rounded-xl flex items-start gap-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: 'var(--danger)',
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {!invite.userExists && (
                  <>
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full h-11 px-3.5 rounded-xl text-sm outline-none transition-all duration-200"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border-primary)',
                          color: 'var(--text-primary)',
                        }}
                        {...inputFocusHandlers}
                        placeholder="Enter your name"
                      />
                    </div>
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Create Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          className="w-full h-11 px-3.5 pr-11 rounded-xl text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border-primary)',
                            color: 'var(--text-primary)',
                          }}
                          {...inputFocusHandlers}
                          placeholder="Minimum 8 characters"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150 hover:opacity-80"
                          style={{ color: 'var(--text-secondary)' }}
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 text-sm font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                    boxShadow: submitting
                      ? 'none'
                      : '0 4px 16px rgba(99,102,241,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!submitting)
                      e.currentTarget.style.boxShadow =
                        '0 6px 24px rgba(99,102,241,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (!submitting)
                      e.currentTarget.style.boxShadow =
                        '0 4px 16px rgba(99,102,241,0.3)';
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      {invite.userExists ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      {invite.userExists
                        ? 'Join Project'
                        : 'Create Account & Join'}
                    </>
                  )}
                </button>
              </form>

              {/* Footer */}
              <div
                className="mt-8 pt-6"
                style={{ borderTop: '1px solid var(--border-primary)' }}
              >
                <p
                  className="text-center text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-medium transition-colors duration-150 hover:opacity-90"
                    style={{ color: 'var(--accent)' }}
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
