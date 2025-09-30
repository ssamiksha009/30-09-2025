// Event listener for the login form submission
document.getElementById('loginForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');

    // Clear previous error messages
    errorMessage.textContent = '';

    // Basic client-side validation
    if (!email || !password) {
        errorMessage.textContent = 'Please enter both email and password';
        return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        errorMessage.textContent = 'Please enter a valid email address';
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            // Store authentication token in localStorage
            localStorage.setItem('authToken', data.token);

            // Decode the JWT token to get user role
            const payload = JSON.parse(atob(data.token.split('.')[1]));

            // Redirect based on user role
            if (payload.role === 'manager') {
                window.location.href = 'manager-dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        } else {
            // Display error message
            errorMessage.textContent = data.message || 'Invalid email or password';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'An error occurred during login. Please try again.';
    }
});

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorMessage.textContent = '';

    const email = (document.getElementById('email') || {}).value || '';
    const password = (document.getElementById('password') || {}).value || '';

    if (!email || !password) {
      errorMessage.textContent = 'Please enter both email and password';
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errorMessage.textContent = 'Please enter a valid email address';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage.textContent = data.message || 'Login failed';
        return;
      }

      const token = data.token || '';
      if (!token) {
        errorMessage.textContent = 'Invalid server response';
        return;
      }

      // Persist token and basic profile info
      localStorage.setItem('authToken', token);
      if (data.user) {
        if (data.user.email) localStorage.setItem('userEmail', data.user.email);
        if (data.user.name)  localStorage.setItem('userName', data.user.name);
        if (data.user.role)  localStorage.setItem('userRole', data.user.role);
      }

      // Determine role: prefer decoded token, then server fields
      let role = (data.role || (data.user && data.user.role) || '').toString();
      if (!role) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
          role = payload.role || payload.userRole || payload.roleName || role;
        } catch (e) { /* ignore */ }
      }
      role = (role || 'engineer').toString().toLowerCase();

      // Redirect based on role
      const target = role === 'manager' ? '/manager-dashboard.html' : '/user-dashboard.html';
      window.location.href = target;
    } catch (err) {
      console.error('Login error:', err);
      errorMessage.textContent = 'An error occurred during login. Please try again.';
    }
  });

  // Toggle password visibility (if toggle exists)
  const toggle = document.querySelector('.toggle-password');
  if (toggle) {
    toggle.addEventListener('click', function () {
      const passwordInput = document.querySelector('#password');
      if (!passwordInput) return;
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      this.classList.toggle('fa-eye');
      this.classList.toggle('fa-eye-slash');
    });
  }
});