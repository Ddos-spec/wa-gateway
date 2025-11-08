document.addEventListener('auth-success', function() {
    // This page is admin-only
    if (Auth.currentUser.role !== 'admin') {
        alert('Access denied. Admin role required.');
        window.location.href = '/admin/dashboard.html';
        return;
    }

    const activitiesTableBody = document.getElementById('activitiesTableBody');

    async function loadActivities() {
        try {
            const response = await fetch('/api/v1/activities?limit=100');
            if (!response.ok) throw new Error('Failed to load activities');
            
            const activities = await response.json();
            renderActivitiesTable(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
            if(activitiesTableBody) {
                activitiesTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error loading activities</td></tr>`;
            }
        }
    }

    async function loadActivitySummary() {
        try {
            const response = await fetch('/api/v1/activities/summary?days=7');
            if (!response.ok) throw new Error('Failed to load summary');
            
            const summary = await response.json();
            
            document.getElementById('totalActivities').textContent = summary.totalActivities || 0;
            document.getElementById('activeUsers').textContent = Object.keys(summary.byUser || {}).length;
            document.getElementById('sessionsCreated').textContent = summary.byAction?.create || 0;
            document.getElementById('messagesSent').textContent = summary.byAction?.send_message || 0;

            const summaryRow = document.getElementById('activitySummaryRow');
            if(summaryRow) summaryRow.style.display = 'block';

        } catch (error) {
            console.error('Error loading activity summary:', error);
        }
    }

    function renderActivitiesTable(activities) {
        if (!activitiesTableBody) return;
        
        if (activities.length === 0) {
            activitiesTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No activities found</td></tr>';
            return;
        }

        activitiesTableBody.innerHTML = activities.map(activity => `
            <tr>
                <td>${new Date(activity.timestamp).toLocaleString()}</td>
                <td>${activity.userEmail}</td>
                <td>${getActionIcon(activity.action)} ${formatAction(activity.action)}</td>
                <td>${getResourceIcon(activity.resource)} ${activity.resource} ${activity.resourceId ? `<br><small class="text-muted">${activity.resourceId}</small>` : ''}</td>
                <td>${formatDetails(activity)}</td>
                <td><small>${activity.ip || 'N/A'}</small></td>
                <td><span class="badge bg-${activity.success ? 'success' : 'danger'}">${activity.success ? 'Success' : 'Failed'}</span></td>
            </tr>
        `).join('');
    }

    function getActionIcon(action) {
        const icons = {
            'login': '<i class="bi bi-box-arrow-in-right text-primary"></i>', 'create': '<i class="bi bi-plus-circle text-success"></i>',
            'delete': '<i class="bi bi-trash text-danger"></i>', 'update': '<i class="bi bi-pencil text-warning"></i>',
            'send_message': '<i class="bi bi-send text-info"></i>', 'create_user': '<i class="bi bi-person-plus text-success"></i>',
            'update_user': '<i class="bi bi-person-gear text-warning"></i>', 'delete_user': '<i class="bi bi-person-x text-danger"></i>'
        };
        return icons[action] || '<i class="bi bi-circle"></i>';
    }

    function getResourceIcon(resource) {
        const icons = {
            'auth': '<i class="bi bi-shield-lock"></i>', 'session': '<i class="bi bi-phone"></i>',
            'message': '<i class="bi bi-chat-dots"></i>', 'user': '<i class="bi bi-person"></i>'
        };
        return icons[resource] || '<i class="bi bi-folder"></i>';
    }

    function formatAction(action) {
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function formatDetails(activity) {
        if (!activity.details) return '-';
        let details = [];
        if (activity.action === 'send_message' && activity.details.recipient) {
            details.push(`To: ${activity.details.recipient}`);
            details.push(`Type: ${activity.details.messageType}`);
        } else if (activity.action === 'create_user' && activity.details.newUserEmail) {
            details.push(`Email: ${activity.details.newUserEmail}`);
            details.push(`Role: ${activity.details.role}`);
        } else if (activity.action === 'update_user' && activity.details.changes) {
            details.push(Object.entries(activity.details.changes).map(([key, value]) => `${key}: ${value}`).join(', '));
        } else if (activity.details.sessionId) {
            details.push(`Session: ${activity.details.sessionId}`);
        }
        return details.join('<br>') || '-';
    }

    window.refreshActivities = async function() {
        await loadActivities();
        await loadActivitySummary();
    }

    // Initialize
    loadActivities();
    loadActivitySummary();
    setInterval(window.refreshActivities, 30000);
});
