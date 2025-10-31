// Check authentication
if (!checkAuth()) {
    window.location.href = 'index.html';
}

// Set username
document.getElementById('username').textContent = localStorage.getItem('username') || 'Admin';

let sessions = [];
let pollingInterval = null;

// Event listener for pairing method
document.querySelectorAll('input[name="pairingMethod"]').forEach(elem => {
    elem.addEventListener('change', function(event) {
        const phoneInputContainer = document.getElementById('phoneInputContainer');
        if (event.target.value === 'phone') {
            phoneInputContainer.classList.remove('d-none');
        } else {
            phoneInputContainer.classList.add('d-none');
        }
    });
});

// Load sessions
async function loadSessions() {
    try {
        const response = await fetch(`${config.apiUrl}${config.endpoints.sessions}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.sessions) {
            sessions = data.sessions;
            renderSessions();
            startStatusPolling();
        } else {
            showToast('error', data.error || 'Gagal memuat sesi');
        }
    } catch (error) {
        console.error('Load sessions error:', error);
        showToast('error', 'Terjadi kesalahan saat memuat sesi');
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
                <p class="text-muted mt-3">Belum ada sesi. Klik "Tambah Session" untuk memulai.</p>
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
        const response = await fetch(`${config.apiUrl}${config.endpoints.sessions}/${sessionName}/status`, {
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
function pollSessionConnection(sessionName) {
    const modal = document.getElementById('addSessionModal');
    let attempts = 0;
    const maxAttempts = 60; // 3 minutes

    const intervalId = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(intervalId);
            showToast('error', 'Waktu tunggu koneksi habis.');
            bootstrap.Modal.getInstance(modal)?.hide();
            return;
        }

        try {
            const response = await fetch(`${config.apiUrl}${config.endpoints.sessions}/${sessionName}/status`, {
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
    const pairingMethod = document.querySelector('input[name="pairingMethod"]:checked').value;

    if (!sessionName) {
        showToast('error', 'Nama sesi harus diisi');
        return;
    }

    const createBtn = document.getElementById('createSessionBtn');
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Membuat...';

    try {
        // 1. Create session in backend
        const createResponse = await fetch(`${config.apiUrl}${config.endpoints.sessions}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ session_name: sessionName })
        });

        const createData = await createResponse.json();

        if (!createResponse.ok) {
            throw new Error(createData.error || 'Gagal membuat sesi');
        }

        showToast('success', 'Sesi berhasil dibuat! Memulai proses pairing...');
        document.getElementById('addSessionForm').classList.add('d-none'); // Hide form inputs
        createBtn.classList.add('d-none'); // Hide create button

        pollSessionConnection(sessionName);

        // 2. Proceed with pairing method
        if (pairingMethod === 'qr') {
            document.getElementById('qrCodeContainer').classList.remove('d-none');
            
            // Poll for QR code
            let qrAttempts = 0;
            const maxQrAttempts = 20; // 1 minute
            const qrInterval = setInterval(async () => {
                qrAttempts++;
                if (qrAttempts > maxQrAttempts) {
                    clearInterval(qrInterval);
                    showToast('error', 'Gagal mendapatkan QR code.');
                    bootstrap.Modal.getInstance(document.getElementById('addSessionModal'))?.hide();
                    return;
                }
                try {
                    const qrResponse = await fetch(`${config.apiUrl}${config.endpoints.sessions}/${sessionName}/qr`, {
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                    const qrData = await qrResponse.json();
                    if (qrResponse.ok && qrData.qr) {
                        clearInterval(qrInterval);
                        document.getElementById('qrCodeImage').src = qrData.qr;
                        document.getElementById('qrSpinner').classList.remove('d-none');
                    }
                } catch (e) { /* ignore */ }
            }, 3000);

        } else if (pairingMethod === 'phone') {
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            if (!phoneNumber) {
                throw new Error('Nomor telepon harus diisi');
            }

            document.getElementById('pairingCodeContainer').classList.remove('d-none');

            const pairResponse = await fetch(`${config.apiUrl}${config.endpoints.sessions}/${sessionName}/pair-phone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ phone_number: phoneNumber })
            });

            const pairData = await pairResponse.json();

            if (!pairResponse.ok) {
                throw new Error(pairData.error || 'Gagal melakukan pairing dengan nomor telepon');
            }
            
            // Assuming the gateway returns the code in `data.code`
            if (pairData.data && pairData.data.code) {
                 document.getElementById('pairingCode').textContent = pairData.data.code;
            } else {
                // If code is not in response, maybe it's sent via webhook or not needed
                showToast('info', 'Permintaan pairing terkirim. Silakan periksa perangkat Anda.');
                document.getElementById('pairingCode').textContent = "---";
            }
        }

    } catch (error) {
        console.error('Create session error:', error);
        showToast('error', error.message || 'Terjadi kesalahan saat membuat sesi');
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Buat Sesi';
        document.getElementById('addSessionForm').classList.remove('d-none');
    }
}


// Reset modal when closed
document.getElementById('addSessionModal').addEventListener('hidden.bs.modal', (event) => {
    const modal = event.target;
    document.getElementById('addSessionForm').reset();
    document.getElementById('addSessionForm').classList.remove('d-none');
    
    document.getElementById('phoneInputContainer').classList.add('d-none');
    document.getElementById('qrCodeContainer').classList.add('d-none');
    document.getElementById('qrCodeImage').src = '';
    document.getElementById('pairingCodeContainer').classList.add('d-none');
    document.getElementById('pairingCode').textContent = '';

    const createBtn = document.getElementById('createSessionBtn');
    createBtn.classList.remove('d-none');
    createBtn.disabled = false;
    createBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Buat Sesi';
    
    const pollingIntervalId = modal.getAttribute('data-polling-interval-id');
    if (pollingIntervalId) {
        clearInterval(parseInt(pollingIntervalId));
        modal.removeAttribute('data-polling-interval-id');
    }
});

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
}

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