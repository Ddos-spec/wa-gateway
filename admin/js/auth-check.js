// admin/js/auth-check.js

const Auth = {
    currentUser: null,

    async init() {
        try {
            const response = await fetch('/api/v1/me');
            if (!response.ok) {
                throw new Error('Not authenticated');
            }
            this.currentUser = await response.json();
            this.onLoginSuccess();
        } catch (error) {
            this.redirectToLogin();
        }
    },

    onLoginSuccess() {
        if (!this.currentUser) return;

        // Populate user info
        const currentUserEl = document.getElementById('currentUser');
        if (currentUserEl) {
            currentUserEl.textContent = `${this.currentUser.email} (${this.currentUser.role})`;
        }

        // Show admin-only menu items
        if (this.currentUser.role === 'admin') {
            const navUsers = document.getElementById('nav-users');
            const navActivities = document.getElementById('nav-activities');
            if (navUsers) navUsers.style.display = 'block';
            if (navActivities) navActivities.style.display = 'block';
        }

        // Attach logout event listener
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout);
        }
        
        // Initialize theme toggler
        this.initThemeToggler();

        // Dispatch a custom event to notify other scripts that authentication is complete
        document.dispatchEvent(new Event('auth-success'));
    },

    logout() {
        fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' })
            .then(() => Auth.redirectToLogin())
            .catch(() => Auth.redirectToLogin());
    },

    redirectToLogin() {
        // Avoid redirect loops if we are already on the login page
        if (!window.location.pathname.includes('/admin/login.html')) {
            window.location.href = '/admin/login.html';
        }
    },
    
    initThemeToggler() {
        const themeToggler = document.getElementById('theme-toggler');
        if (!themeToggler) return;

        const themeIcon = themeToggler.querySelector('i');
        const getPreferredTheme = () => {
            return localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        };

        const setTheme = (theme) => {
            document.documentElement.setAttribute('data-bs-theme', theme);
            if (themeIcon) {
                if (theme === 'dark') {
                    themeIcon.classList.remove('bi-sun-fill');
                    themeIcon.classList.add('bi-moon-stars-fill');
                } else {
                    themeIcon.classList.remove('bi-moon-stars-fill');
                    themeIcon.classList.add('bi-sun-fill');
                }
            }
            localStorage.setItem('theme', theme);
        };

        setTheme(getPreferredTheme());
        themeToggler.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            setTheme(currentTheme);
        });
    }
};