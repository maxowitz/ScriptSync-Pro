import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Film, AlertCircle, CheckCircle } from 'lucide-react';
import client from '../api/client';

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Validating invitation...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-xl mb-4">
              <Film className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ScriptSync Pro</h1>
            <p className="text-gray-500 mt-1">You&apos;ve been invited</p>
          </div>

          {error && !invite && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {invite && (
            <>
              {/* Invite details */}
              <div className="mb-6 p-4 bg-indigo-50 rounded-lg text-center">
                <p className="text-sm text-indigo-600 font-medium">
                  You&apos;re invited to join
                </p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {invite.projectName}
                </p>
                <span className="inline-block mt-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium uppercase">
                  {invite.role}
                </span>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {!invite.userExists && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Enter your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Create Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Choose a password"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {submitting
                    ? 'Joining...'
                    : invite.userExists
                      ? 'Join Project'
                      : 'Create Account & Join'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
