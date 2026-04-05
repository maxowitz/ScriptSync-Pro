import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Film, AlertCircle, CheckCircle, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import client from '../api/client';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsDoNotMatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await client.post('/auth/reset-password', { token, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
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

  if (!token) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, #0a0a0b 70%)',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div
          className="w-full max-w-[420px] rounded-2xl p-8 sm:p-10 text-center"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.03), 0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
            style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <AlertCircle
              className="w-6 h-6"
              style={{ color: 'var(--danger)' }}
            />
          </div>
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Invalid reset link
          </h2>
          <p
            className="text-sm mt-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            This link is missing or expired.
          </p>
          <Link
            to="/forgot-password"
            className="inline-flex items-center gap-2 mt-6 text-sm font-medium transition-colors duration-150 hover:opacity-90"
            style={{ color: 'var(--accent)' }}
          >
            Request a new link
          </Link>
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
              Set New Password
            </h1>
            <p
              className="mt-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Choose a strong new password
            </p>
          </div>

          {success ? (
            /* Success state */
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
                style={{
                  backgroundColor: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.2)',
                }}
              >
                <CheckCircle
                  className="w-6 h-6"
                  style={{ color: 'var(--success)' }}
                />
              </div>
              <h2
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Password reset!
              </h2>
              <p
                className="text-sm mt-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Redirecting to login...
              </p>
              <div className="mt-4 flex justify-center">
                <Loader2
                  className="w-4 h-4 animate-spin"
                  style={{ color: 'var(--accent)' }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Error */}
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

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    New Password
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
                        border: `1px solid ${passwordTooShort ? 'var(--warning)' : 'var(--border-primary)'}`,
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
                  {passwordTooShort && (
                    <p
                      className="mt-1.5 text-xs"
                      style={{ color: 'var(--warning)' }}
                    >
                      Password must be at least 8 characters
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full h-11 px-3.5 pr-11 rounded-xl text-sm outline-none transition-all duration-200"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: `1px solid ${passwordsDoNotMatch ? 'var(--danger)' : 'var(--border-primary)'}`,
                        color: 'var(--text-primary)',
                      }}
                      {...inputFocusHandlers}
                      placeholder="Re-enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150 hover:opacity-80"
                      style={{ color: 'var(--text-secondary)' }}
                      tabIndex={-1}
                    >
                      {showConfirm ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {passwordsDoNotMatch && (
                    <p
                      className="mt-1.5 text-xs"
                      style={{ color: 'var(--danger)' }}
                    >
                      Passwords do not match
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-sm font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                    boxShadow: loading
                      ? 'none'
                      : '0 4px 16px rgba(99,102,241,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading)
                      e.currentTarget.style.boxShadow =
                        '0 6px 24px rgba(99,102,241,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (!loading)
                      e.currentTarget.style.boxShadow =
                        '0 4px 16px rgba(99,102,241,0.3)';
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>

              {/* Back to login */}
              <div className="mt-8 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-150 hover:opacity-90"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
