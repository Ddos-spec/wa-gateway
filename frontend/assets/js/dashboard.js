// Check authentication
if (!checkAuth()) {
    throw new Error('Not authenticated');
}

// Set username
document.getElementById('username').textContent = localStorage.getItem('username') || 'Admin';

let sessions = [];
let pollingInterval = null;

// Load sessions
async function loadSessions() {
    try {
        const response = await fetch(`${config.apiUrl}${config.endpoints.sessions}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.data) {
            sessions = data.data;
            renderSessions();
            startStatusPolling();
        } else {
            showToast('error', data.error || 'Gagal memuat sessions');
        }
    } catch (error) {
        console.error('Load sessions error:', error);
        showToast('error', 'Terjadi kesalahan saat memuat sessions');
    }
}

// Render sessions
function renderSessions() {
    const container = document.getElementById('sessionsList');
    if (!container) return;

    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-inbox" style="font-size: 80px; color: #ccc;"></i>
                <p class="text-muted mt-3">Belum ada session. Klik "Tambah Session" untuk memulai.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = sessions.map(session => `
        <div class="col-md-6 col-lg-4">
            <div class="card session-card">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="mb-0">${session.session_name}</h5>
                        <span class="badge bg-secondary" id="status-${session.session_name}">${session.status}</span>
                    </div>
                    <p class="text-muted mb-2">
                        <i class="bi bi-person"></i> ${session.profile_name || 'Belum terhubung'}
                    </p>
                    <p class="text-muted mb-3">
                        <i class="bi bi-phone"></i> ${session.wa_number || '-'}
                    </p>
                    <div class="d-grid gap-2">
                        <a href="detail.html?session=${session.session_name}" class="btn btn-primary btn-sm">
                            <i class="bi bi-gear"></i> Detail
                        </a>
                    </div>
                </div>
            </div>
        </div>
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
                    const response = await fetch(`${config.apiUrl}${config.endpoints.sessions}/${sessionName}/status`, {            headers: {
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

// Create session
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
            await fetch(`${config.apiUrl}${config.endpoints.sessions}/${sessionName}/status`, {
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

async function createSession() {
    const sessionName = document.getElementById('sessionName').value.trim();
    
    if (!sessionName) {
        showToast('error', 'Nama session harus diisi');
        return;
    }
    
    const createBtn = document.getElementById('createSessionBtn');
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Membuat...';
    
    try {
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ session: sessionName })
        };

        const response = await fetch(`${config.apiUrl}/session/start`, fetchOptions);
        const data = await response.json();
        
        if (response.ok && data.qr) {
            showToast('success', 'Session berhasil dibuat! Pindai QR Code di bawah ini.');
            document.getElementById('qrCodeContainer').classList.remove('d-none');
            document.getElementById('qrCodeImage').src = data.qr;
            createBtn.classList.add('d-none');
            pollSessionStatus(sessionName);
        } else {
            showToast('error', data.message || 'Gagal membuat session');
            createBtn.disabled = false;
            createBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Buat Session';
        }
    } catch (error) {
        console.error('Create session error:', error);
        showToast('error', 'Terjadi kesalahan saat membuat session');
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Buat Session';
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
    createBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Buat Session';
    
    const pollingIntervalId = modal.getAttribute('data-polling-interval-id');
    if (pollingIntervalId) {
        clearInterval(parseInt(pollingIntervalId));
        modal.removeAttribute('data-polling-interval-id');
    }
});

// Load sessions on page load
loadSessions();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
});
