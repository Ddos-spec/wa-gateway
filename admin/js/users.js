document.addEventListener('auth-success', function() {
    // This page is admin-only
    if (Auth.currentUser.role !== 'admin') {
        alert('Access denied. Admin role required.');
        window.location.href = '/admin/dashboard.html';
        return;
    }

    let users = [];
    const usersTableBody = document.getElementById('usersTableBody');
    const addUserModal = new bootstrap.Modal(document.getElementById('addUserModal'));
    const editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));

    async function loadUsers() {
        try {
            const response = await fetch('/api/v1/users');
            if (!response.ok) throw new Error('Failed to load users');
            
            users = await response.json();
            renderUsersTable();
        } catch (error) {
            console.error('Error loading users:', error);
            if(usersTableBody) {
                usersTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error loading users</td></tr>`;
            }
        }
    }

    function renderUsersTable() {
        if (!usersTableBody) return;

        if (users.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No users found</td></tr>';
            return;
        }

        usersTableBody.innerHTML = users.map(user => `
            <tr>
                <td>${user.email}</td>
                <td><span class="badge bg-${user.role === 'admin' ? 'danger' : 'primary'}">${user.role}</span></td>
                <td>${user.sessions ? user.sessions.length : 0}</td>
                <td>${user.createdBy || 'System'}</td>
                <td>${new Date(user.createdAt).toLocaleString()}</td>
                <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
                <td><span class="badge bg-${user.isActive ? 'success' : 'secondary'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="window.editUser('${user.email}')"><i class="bi bi-pencil"></i></button>
                    ${user.email !== Auth.currentUser.email ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteUser('${user.email}')"><i class="bi bi-trash"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    }

    window.editUser = function(email) {
        const user = users.find(u => u.email === email);
        if (!user) return;

        document.getElementById('editEmail').value = user.email;
        document.getElementById('editEmailDisplay').value = user.email;
        document.getElementById('editRole').value = user.role;
        document.getElementById('editIsActive').checked = user.isActive;
        document.getElementById('editPassword').value = '';

        editUserModal.show();
    }

    window.deleteUser = async function(email) {
        if (!confirm(`Are you sure you want to delete user ${email}?`)) return;

        try {
            const response = await fetch(`/api/v1/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete user');
            }
            await loadUsers();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    // Form handlers
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('newEmail').value;
        const password = document.getElementById('newPassword').value;
        const role = document.getElementById('newRole').value;

        try {
            const response = await fetch('/api/v1/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create user');
            }

            addUserModal.hide();
            document.getElementById('addUserForm').reset();
            await loadUsers();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('editEmail').value;
        const updates = {
            role: document.getElementById('editRole').value,
            isActive: document.getElementById('editIsActive').checked
        };
        
        const password = document.getElementById('editPassword').value;
        if (password) {
            updates.password = password;
        }

        try {
            const response = await fetch(`/api/v1/users/${encodeURIComponent(email)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update user');
            }

            editUserModal.hide();
            await loadUsers();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });

    // Initialize
    loadUsers();
    setInterval(loadUsers, 30000); // Refresh users every 30 seconds
});
