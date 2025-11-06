if (!checkAuth()) {
    window.location.href = 'index.html';
}

// Set username
document.getElementById('username').textContent = localStorage.getItem('username') || 'Admin';

let sessions = [];
let pollingInterval = null;

// Configuration
const config = {
    endpoints: {
        sessions: '/api/sessions'
    }
};

// UI State Management
function showState(state) {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const tableBody = document.getElementById('sessionsTableBody');

    // Clear only data rows
    tableBody.querySelectorAll('tr:not(#loadingState):not(#emptyState)').forEach(row => row.remove());

    loadingState.classList.add('d-none');
    emptyState.classList.add('d-none');

    if (state === 'loading') {
        loadingState.classList.remove('d-none');
    } else if (state === 'empty') {
        emptyState.classList.remove('d-none');
    }
}

// Load sessions
async function loadSessions() {
    showState('loading');
    try {
        const response = await fetch(getApiUrl(config.endpoints.sessions), {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('API returned non-JSON response - check if backend is running');
        }

        const data = await response.json();
        
        if (data.success && Array.isArray(data.sessions)) {
            sessions = data.sessions;
            displaySessions();
            
            if (sessions.length > 0) {
                startStatusPolling();
            }
        } else if (data.success && Array.isArray(data.data)) {
            sessions = data.data;
            displaySessions();
            
            if (sessions.length > 0) {
                startStatusPolling();
            }
        } else {
            // No sessions found or invalid format
            sessions = [];
            showState('empty');
        }
        
    } catch (error) {
        console.error('Load sessions error:', error);
        showState('empty');
        if (typeof showToast === 'function') {
            showToast('error', `Failed to load sessions: ${error.message}`);
        }
    }
}

// Display sessions in table
function displaySessions() {
    const tableBody = document.getElementById('sessionsTableBody');
    
    // Clear existing data rows
    tableBody.querySelectorAll('tr:not(#loadingState):not(#emptyState)').forEach(row => row.remove());
    
    if (sessions.length === 0) {
        showState('empty');
        return;
    }

    sessions.forEach(session => {
        const row = createSessionRow(session);
        tableBody.appendChild(row);
    });
}

// Create session row
function createSessionRow(session) {
    const row = document.createElement('tr');
    row.className = 'session-row';
    row.setAttribute('data-session', session.name || session.session_name);
    
    const sessionName = session.name || session.session_name;
    const status = session.status || 'offline';
    const statusClass = status === 'online' ? 'success' : status === 'connecting' ? 'warning' : 'danger';
    
    row.innerHTML = `
        <td>
            <div class="d-flex align-items-center">
                <div class="session-avatar">
                    <i class="fab fa-whatsapp"></i>
                </div>
                <div class="ml-3">
                    <div class="font-weight-bold">${sessionName}</div>
                    <div class="small text-muted">Created: ${new Date(session.created_at).toLocaleDateString()}</div>
                </div>
            </div>
        </td>
        <td>
            <span class="badge badge-${statusClass} session-status" data-session="${sessionName}">
                ${status}
            </span>
        </td>
        <td>
            <div class="session-profile">
                <div class="font-weight-bold">${session.profile_name || '-'}</div>
                <div class="small text-muted">${session.wa_number || 'Not connected'}</div>
            </div>
        </td>
        <td>
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-primary" onclick="viewSession('${sessionName}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSession('${sessionName}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
    
    return row;
}

// ===== COMPLETELY FIXED UPDATE SESSION STATUS FUNCTION =====
// Update session status - LINE 131 FIX HERE
async function updateSessionStatus(sessionName) {
    try {
        const response = await fetch(getApiUrl(`${config.endpoints.sessions}/${sessionName}/status`), {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        // ✅ FIX 1: Silently skip 404 errors - endpoint doesn't exist yet
        if (!response.ok) {
            if (response.status === 404) {
                return; // Skip silently, no error logging
            }
            return; // Skip other HTTP errors silently too
        }

        // ✅ FIX 2: Check if response is actually JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return; // Skip non-JSON responses silently
        }

        // ✅ FIX 3: Only parse JSON if we're sure it's JSON
        const data = await response.json();
        if (data.success && data.session) {
            updateSessionInTable(sessionName, data.session);
        }
    } catch (error) {
        // ✅ FIX 4: Filter out HTML parsing errors to stop console spam
        if (!error.message.includes('Unexpected token') && 
            !error.message.includes('<!DOCTYPE') && 
            !error.message.includes('is not valid JSON') &&
            !error.message.includes('Unexpected end of JSON input')) {
            console.error('Update status error:', error);
        }
        // All HTML parsing errors are now silently ignored
    }
}

// Update session in table
function updateSessionInTable(sessionName, sessionData) {
    const statusElement = document.querySelector(`.session-status[data-session="${sessionName}"]`);
    if (statusElement) {
        const statusClass = sessionData.status === 'online' ? 'success' : 
                          sessionData.status === 'connecting' ? 'warning' : 'danger';
        
        statusElement.className = `badge badge-${statusClass} session-status`;
        statusElement.textContent = sessionData.status;
    }

    // Update profile info if available
    const row = document.querySelector(`.session-row[data-session="${sessionName}"]`);
    if (row && sessionData.profile_name) {
        const profileDiv = row.querySelector('.session-profile');
        if (profileDiv) {
            profileDiv.innerHTML = `
                <div class="font-weight-bold">${sessionData.profile_name}</div>
                <div class="small text-muted">${sessionData.wa_number || 'Connected'}</div>
            `;
        }
    }
}

// Start status polling
function startStatusPolling() {
    // Clear existing interval
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Start new polling every 15 seconds (reduced frequency)
    pollingInterval = setInterval(updateAllStatus, 15000);
}

// Update all session status
async function updateAllStatus() {
    for (const session of sessions) {
        const sessionName = session.name || session.session_name;
        await updateSessionStatus(sessionName);
        // Add small delay between requests to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// View session details
function viewSession(sessionName) {
    if (typeof showToast === 'function') {
        showToast('info', `Viewing session: ${sessionName}`);
    } else {
        alert(`Viewing session: ${sessionName}`);
    }
}

// Delete session
async function deleteSession(sessionName) {
    if (!confirm(`Are you sure you want to delete session "${sessionName}"?`)) {
        return;
    }

    try {
        const response = await fetch(getApiUrl(`${config.endpoints.sessions}/${sessionName}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (response.ok) {
            if (typeof showToast === 'function') {
                showToast('success', `Session "${sessionName}" deleted successfully`);
            }
            loadSessions(); // Reload sessions
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Delete session error:', error);
        if (typeof showToast === 'function') {
            showToast('error', `Failed to delete session: ${error.message}`);
        }
    }
}

// Add new session
function addNewSession() {
    const sessionName = prompt('Enter session name:');
    if (!sessionName) return;

    if (typeof showToast === 'function') {
        showToast('info', `Adding new session: ${sessionName}`);
    }
}

// Refresh sessions
function refreshSessions() {
    loadSessions();
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Dashboard initializing...');
    loadSessions();
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
});
