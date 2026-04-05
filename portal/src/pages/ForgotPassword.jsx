import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, AlertCircle, Mail, ArrowLeft, Loader2 } from 'lucide-react';
import client from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await client.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

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
              Reset Password
            </h1>
            <p
              className="mt-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          {sent ? (
            /* Success state */
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
                style={{
                  backgroundColor: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.2)',
                }}
              >
                <Mail className="w-6 h-6" style={{ color: 'var(--success)' }} />
              </div>
              <h2
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Check your email
              </h2>
              <p
                className="text-sm mt-2 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                We&apos;ve sent a password reset link to{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {email}
                </strong>
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 mt-8 text-sm font-medium transition-colors duration-150 hover:opacity-90"
                style={{ color: 'var(--accent)' }}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </Link>
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
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-11 px-3.5 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent)';
                      e.target.style.boxShadow =
                        '0 0 0 3px rgba(99,102,241,0.15)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--border-primary)';
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder="you@example.com"
                  />
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
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
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
