document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');

  if (!loginForm) {
    return;
  }

  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');

  if (togglePassword && passwordInput) {
      togglePassword.addEventListener('click', function () {
          // Toggle the type attribute
          const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
          passwordInput.setAttribute('type', type);
          // Toggle the icon
          this.querySelector('i').classList.toggle('bi-eye-fill');
          this.querySelector('i').classList.toggle('bi-eye-slash-fill');
      });
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = (document.getElementById('username')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    const errorDiv = document.getElementById('errorMessage');

    if (submitButton) {
      submitButton.disabled = true;
    }

    if (loginText) {
      loginText.textContent = 'Logging in...';
    }

    if (loginSpinner) {
      loginSpinner.classList.remove('d-none');
    }

    if (errorDiv) {
      errorDiv.style.display = 'none';
    }

    try {
      const response = await fetch(
        `${config.apiUrl}${config.endpoints.login}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ username, password }),
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Login failed' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.token) {
        saveToken(data.token);
        localStorage.setItem('username', username);
        localStorage.setItem('userRole', data.user.role || 'admin');
        localStorage.setItem('userType', data.user.userType || 'admin');

        showMessage('Login successful! Redirecting...', 'success');

        // Redirect to appropriate dashboard based on user role
        setTimeout(() => {
          if (data.user.role === 'customer' || data.user.userType === 'customer') {
            window.location.href = './customer_dashboard.html';
          } else {
            // For admin or other roles, go to main dashboard
            window.location.href = './dashboard.html';
          }
        }, 1000);
      } else {
        throw new Error('No token received from server');
      }
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. ';

      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage +=
            'Cannot connect to server. Please check your connection and try again.';
        } else if (error.message.includes('401')) {
          errorMessage += 'Invalid username or password.';
        } else if (error.message.includes('CORS')) {
          errorMessage += 'Server configuration error. Please contact administrator.';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Unexpected error occurred.';
      }

      showMessage(errorMessage, 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }

      if (loginText) {
        loginText.textContent = 'Login';
      }

      if (loginSpinner) {
        loginSpinner.classList.add('d-none');
      }
    }
  });
});

function showMessage(message, type = 'error') {
  const errorDiv = document.getElementById('errorMessage') || createMessageDiv();
  errorDiv.textContent = message;
  errorDiv.className = `alert alert-${type === 'error' ? 'danger' : 'success'}`;
  errorDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 3000);
  }
}

function createMessageDiv() {
  const div = document.createElement('div');
  div.id = 'errorMessage';
  div.style.marginTop = '1rem';
  const form = document.getElementById('loginForm');
  form?.parentNode?.insertBefore(div, form);
  return div;
}

if (getToken()) {
  fetch(`${config.apiUrl}${config.endpoints.verify}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
    .then((res) => {
      if (res.ok) {
        window.location.href = './dashboard.html';
      }
    })
    .catch((err) => console.error('Token verification failed:', err));
}
