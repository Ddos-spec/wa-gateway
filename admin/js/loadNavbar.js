// admin/js/loadNavbar.js

document.addEventListener('DOMContentLoaded', function () {
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) {
        console.error('Navbar container not found!');
        return;
    }

    fetch('/admin/navbar.html')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to fetch navbar: ${response.status}`);
            }
            return response.text();
        })
        .then(data => {
            navbarContainer.innerHTML = data;
            
            // Set the active nav link based on the current page
            const currentPage = window.location.pathname;
            const navLinks = navbarContainer.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                const linkPath = new URL(link.href).pathname;
                if (linkPath === currentPage) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                }
            });

            // Now that the navbar is loaded, initialize the authentication check.
            // This ensures all navbar elements (like #currentUser, #logout-btn) are in the DOM.
            if (typeof Auth !== 'undefined' && typeof Auth.init === 'function') {
                Auth.init();
            } else {
                console.error('Auth object or Auth.init function is not defined. Make sure auth-check.js is loaded.');
            }
        })
        .catch(error => {
            console.error('Error loading navbar:', error);
            navbarContainer.innerHTML = '<div class="alert alert-danger m-3">Failed to load navigation bar. Please try refreshing the page.</div>';
        });
});