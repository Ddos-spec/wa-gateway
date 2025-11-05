// Check authentication
if (!checkAuth()) {
    window.location.href = 'index.html';
}

// Set username
document.getElementById('username').textContent = localStorage.getItem('username') || 'Admin';

let sessions = [];
let pollingInterval = null;

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
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      sessions = data.data;
      if (sessions.length === 0) {
        showState('empty');
      } else {
        showState('data');
        renderSessions();
        startStatusPolling();
      }
    } else {
      throw new Error(data.error || 'Invalid response format');
    }
  } catch (error) {
    console.error('Load sessions error:', error);
    showState('empty');
    showToast('error', `Failed to load sessions: ${error.message}`);
  }
}

// Render sessions in a table
function renderSessions() {
    const tableBody = document.getElementById('sessionsTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML += sessions.map(session => `
        <tr>
            <td><strong>${session.session_name}</strong></td>
            <td><span class="badge bg-secondary" id="status-${session.session_name}">${session.status}</span></td>
            <td>${session.profile_name || 'Belum terhubung'}</td>
            <td>${session.wa_number || '-'}</td>
            <td>
                <a href="detail.html?session=${session.session_name}" class="btn btn-primary btn-sm">
                    <i class="bi bi-gear"></i> Detail
                </a>
            </td>
        </tr>
    `).join('');
}

// Start status polling
function startStatusPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    updateAllStatus();
    pollingInterval = setInterval(updateAllStatus, 10000);
}

// Update all session status
async function updateAllStatus() {
    for (const session of sessions) {
        if (session.session_name) {
            await updateSessionStatus(session.session_name);
        }
    }
}

// Update single session status
async function updateSessionStatus(sessionName) {
    try {
        const response = await fetch(getApiUrl(`${config.endpoints.sessions}/${sessionName}/status`), {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) return;

        const data = await response.json();
        
        if (data.success) {
            const statusBadge = document.getElementById(`status-${sessionName}`);
            if (statusBadge) {
                statusBadge.textContent = data.status;
                statusBadge.className = 'badge';
                
                if (data.status === 'online' || data.status === 'connected') {
                    statusBadge.classList.add('bg-success');
                } else if (data.status === 'connecting') {
                    statusBadge.classList.add('bg-warning');
                } else {
                    statusBadge.classList.add('bg-danger');
                }
            }
        }
    } catch (error) {
        console.error('Update status error:', error);
    }
}

// Poll for session connection
function pollSessionStatus(sessionName) {
    const modal = document.getElementById('addSessionModal');
    let attempts = 0;
    const maxAttempts = 40; // 2 minutes

    const intervalId = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(intervalId);
            showToast('error', 'Waktu tunggu untuk memindai QR habis.');
            bootstrap.Modal.getInstance(modal)?.hide();
            return;
        }

        try {
            const response = await fetch(getApiUrl(`${config.endpoints.sessions}/${sessionName}/status`), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!response.ok) return;

            const data = await response.json();

            if (data.success && (data.status === 'connected' || data.status === 'online')) {
                clearInterval(intervalId);
                showToast('success', `Sesi '${sessionName}' berhasil terhubung!`);
                bootstrap.Modal.getInstance(modal)?.hide();
                loadSessions();
            }
        } catch (error) {
            console.error('Polling status error:', error);
        }
    }, 3000);

    modal.setAttribute('data-polling-interval-id', intervalId);
}

// Create session
async function createSession() {
  const sessionName = document.getElementById('sessionName').value.trim();
  
  if (!sessionName) {
    showToast('error', 'Session name required');
    return;
  }
  
  const createBtn = document.getElementById('createSessionBtn');
  createBtn.disabled = true;
  createBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';
  
  try {
    // ✅ Single call to backend /api/sessions/start
    // Backend will handle DB creation + gateway communication
    const response = await fetch(getApiUrl(config.endpoints.sessionStart), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ session: sessionName })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.qr) {
      // Show QR code
      document.getElementById('qrCodeContainer').classList.remove('d-none');
      document.getElementById('qrCodeImage').src = data.qr;
      createBtn.classList.add('d-none');
      
      // Start polling for connection
      pollSessionStatus(sessionName);
    } else if (data.status === 'connected') {
      // Already connected
      showToast('success', `Session '${sessionName}' connected!`);
      bootstrap.Modal.getInstance(document.getElementById('addSessionModal'))?.hide();
      loadSessions();
    } else {
      throw new Error('Unexpected response from server');
    }

  } catch (error) {
    console.error('Create session error:', error);
    showToast('error', error.message || 'Failed to create session');
    createBtn.disabled = false;
    createBtn.innerHTML = 'Create Session';
  }
}

// Reset modal when closed
document.getElementById('addSessionModal').addEventListener('hidden.bs.modal', (event) => {
    const modal = event.target;
    document.getElementById('sessionName').value = '';
    document.getElementById('qrCodeContainer').classList.add('d-none');
    document.getElementById('qrCodeImage').src = '';
    const createBtn = document.getElementById('createSessionBtn');
    createBtn.classList.remove('d-none');
    createBtn.disabled = false;
    createBtn.innerHTML = 'Buat Session';
    
    const pollingIntervalId = modal.getAttribute('data-polling-interval-id');
    if (pollingIntervalId) {
        clearInterval(parseInt(pollingIntervalId));
        modal.removeAttribute('data-polling-interval-id');
    }
});

// Toast functions
function showToast(type, message) {
    const toastId = type === 'success' ? 'successToast' : 'errorToast';
    const messageId = type === 'success' ? 'successMessage' : 'errorMessage';
    
    document.getElementById(messageId).textContent = message;
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// Initial load
loadSessions();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
});
