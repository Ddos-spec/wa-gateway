// admin/js/loadNavbar.js

document.addEventListener('DOMContentLoaded', function () {
    const offcanvasContainer = document.getElementById('offcanvas-container');
    if (!offcanvasContainer) {
        console.error('Offcanvas container not found!');
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
            offcanvasContainer.innerHTML = data;
            
            // Set the active nav link based on the current page
            const currentPage = window.location.pathname;
            const navLinks = offcanvasContainer.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                const linkPath = new URL(link.href).pathname;
                if (linkPath === currentPage) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                }
            });

            // Initialize Offcanvas toggle for main content adjustment
            const offcanvasElement = document.getElementById('offcanvasNavbar');
            if (offcanvasElement) {
                offcanvasElement.addEventListener('show.bs.offcanvas', function () {
                    document.body.classList.add('offcanvas-open');
                });
                offcanvasElement.addEventListener('hide.bs.offcanvas', function () {
                    document.body.classList.remove('offcanvas-open');
                });
            }

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
            offcanvasContainer.innerHTML = '<div class="alert alert-danger m-3">Failed to load navigation bar. Please try refreshing the page.</div>';
        });
});