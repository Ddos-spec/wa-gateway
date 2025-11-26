// admin/js/auth-check.js
// Simplified Auth Check - Always Admin

const Auth = {
    currentUser: {
        email: 'admin@localhost',
        role: 'admin',
        id: 'system-admin'
    },

    init() {
        // Immediately trigger success
        this.onLoginSuccess();
    },

    onLoginSuccess() {
        // Populate user info
        const currentUserEl = document.getElementById('currentUser');
        // User info display removed
        // if (currentUserEl) {
        //    currentUserEl.textContent = 'Admin System';
        // }

        // Show admin-only menu items (always show)
        const navUsers = document.getElementById('nav-users');
        const navActivities = document.getElementById('nav-activities');
        if (navUsers) navUsers.style.display = 'block';
        if (navActivities) navActivities.style.display = 'block';
        
        // Remove logout button since it's not needed
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.style.display = 'none';
        }
        
        // Initialize theme toggler
        this.initThemeToggler();

        // Dispatch a custom event to notify other scripts
        document.dispatchEvent(new Event('auth-success'));
    },

    logout() {
        // Do nothing or reload
        window.location.reload();
    },

    redirectToLogin() {
        // Do nothing
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
