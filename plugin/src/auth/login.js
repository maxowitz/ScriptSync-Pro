/**
 * ScriptSync Pro - Login UI and Auth Flow
 */

const LoginManager = (() => {
  function render() {
    const container = document.getElementById('login-form-container');
    if (!container) return;

    container.innerHTML = `
      <form id="login-form" class="login-form">
        <div class="form-group">
          <label for="login-email">Email</label>
          <input type="email" id="login-email" placeholder="you@studio.com" required />
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <input type="password" id="login-password" placeholder="Password" required />
        </div>
        <div class="remember-row">
          <input type="checkbox" id="login-remember" checked />
          <label for="login-remember">Remember me</label>
        </div>
        <div id="login-error" class="login-error"></div>
        <button type="submit" id="login-submit" class="btn btn-primary btn-block btn-lg">
          Sign In
        </button>
        <p style="text-align:center; margin-top:12px; font-size:11px; color:var(--text-muted);">
          Don't have an account?
          <a href="#" id="show-register" style="color:var(--accent-blue);">Register</a>
        </p>
      </form>
      <form id="register-form" class="login-form hidden">
        <div class="form-group">
          <label for="reg-name">Name</label>
          <input type="text" id="reg-name" placeholder="Your Name" required />
        </div>
        <div class="form-group">
          <label for="reg-email">Email</label>
          <input type="email" id="reg-email" placeholder="you@studio.com" required />
        </div>
        <div class="form-group">
          <label for="reg-password">Password</label>
          <input type="password" id="reg-password" placeholder="Password (min 8 chars)" required />
        </div>
        <div id="register-error" class="login-error"></div>
        <button type="submit" id="register-submit" class="btn btn-primary btn-block btn-lg">
          Create Account
        </button>
        <p style="text-align:center; margin-top:12px; font-size:11px; color:var(--text-muted);">
          Already have an account?
          <a href="#" id="show-login" style="color:var(--accent-blue);">Sign In</a>
        </p>
      </form>
    `;

    // Toggle between login and register
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('register-form').classList.remove('hidden');
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
    });

    // Login form submit
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleLogin();
    });

    // Register form submit
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleRegister();
    });
  }

  async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');

    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      const data = await CloudAPI.login(email, password);

      // If not remembering, clear refresh token so session is ephemeral
      if (!remember) {
        TokenStore.setRefreshToken(null);
      }

      onLoginSuccess(data);
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed. Check your credentials.';
      console.error('[Login] Error:', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  }

  async function handleRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('register-error');
    const submitBtn = document.getElementById('register-submit');

    if (password.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      return;
    }

    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      await CloudAPI.register(name, email, password);
      // Auto-login after registration
      const data = await CloudAPI.login(email, password);
      onLoginSuccess(data);
    } catch (err) {
      errorEl.textContent = err.message || 'Registration failed.';
      console.error('[Register] Error:', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  }

  function onLoginSuccess(data) {
    // Hide login, show main app
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    // Dispatch event so main.js can handle post-login setup
    document.dispatchEvent(new CustomEvent('auth:login', { detail: data }));
  }

  function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    render();
  }

  function handleLogout() {
    CloudAPI.logout();
    SocketClient.disconnect();
    showLogin();
    document.dispatchEvent(new CustomEvent('auth:logout'));
  }

  return {
    render,
    showLogin,
    handleLogout,
    onLoginSuccess
  };
})();
