import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Film, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import useAuth from '../hooks/useAuth';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/projects');
    } catch {
      // error is set in useAuth
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
              ScriptSync Pro
            </h1>
            <p
              className="mt-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sign in to your account
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-6 p-3.5 rounded-xl flex items-start gap-3 text-sm animate-in fade-in duration-200"
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
                Email
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium transition-colors duration-150 hover:opacity-90"
                  style={{ color: 'var(--accent)' }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 pr-11 rounded-xl text-sm outline-none transition-all duration-200"
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
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150 hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
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
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <p
              className="text-center text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Don&apos;t have an account?{' '}
              <Link
                to="/accept-invite"
                className="font-medium transition-colors duration-150 hover:opacity-90"
                style={{ color: 'var(--accent)' }}
              >
                Request an invite
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
