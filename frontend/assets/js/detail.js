window.onerror = function(message, source, lineno, colno, error) {
    const errorContainer = document.getElementById('error-container');
    const errorDetails = document.getElementById('error-details');
    if (errorContainer && errorDetails) {
        errorDetails.textContent = `Pesan: ${message}\nSumber: ${source}\nBaris: ${lineno}\nKolom: ${colno}\nError: ${error}`;
        errorContainer.style.display = 'block';
    }
    return true; // Mencegah error ditampilkan di konsol browser
};

function copyErrorDetails() {
    const errorDetails = document.getElementById('error-details');
    if (errorDetails) {
        navigator.clipboard.writeText(errorDetails.textContent).then(() => {
            showToast('success', 'Detail kesalahan berhasil disalin!');
        }).catch(err => {
            showToast('error', 'Gagal menyalin detail kesalahan.');
        });
    }
}

// Check authentication
if (!checkAuth()) {
    window.location.href = 'index.html';
}

// Get session ID from URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

if (!sessionId) {
    showToast('error', 'Session ID tidak ditemukan');
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 2000);
}

let session = null;
let statusPolling = null;
let profileFetched = false; // Flag to prevent multiple fetches

// ✅ IMPROVEMENT: Centralized fetch wrapper with proper error handling
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                ...options.headers
            }
        });

        // Check content type untuk handle JSON error response
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');
        
        const data = isJson ? await response.json() : await response.text();

        // Handle HTTP errors (4xx, 5xx)
        if (!response.ok) {
            // Reject dengan detail error dari server
            return Promise.reject({
                status: response.status,
                statusText: response.statusText,
                message: isJson ? (data.error || data.message) : data,
                data: data
            });
        }

        return data;
    } catch (error) {
        // Network errors atau parsing errors
        if (error.status) {
            // Sudah di-format dari Promise.reject di atas
            throw error;
        }
        // Network error murni
        throw {
            status: 0,
            statusText: 'Network Error',
            message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
            originalError: error
        };
    }
}

// Load session details
async function loadSessionDetails() {
    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}`);
        
        if (data.session) {
            session = data.session;
            renderSessionDetails();
            updateStatus();
            startStatusPolling();
            loadWebhooks(); // Load webhooks after session details
        } else {
            throw new Error('Data session tidak valid');
        }
    } catch (error) {
        console.error('Load session details error:', error);
        showToast('error', error.message || 'Gagal memuat detail session');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
    }
}

// Render session details
function renderSessionDetails() {
    document.getElementById('sessionName').textContent = session.session_name;
    document.getElementById('profileName').textContent = session.profile_name || 'Belum terhubung';
    document.getElementById('waNumber').textContent = session.wa_number || '-';
    document.getElementById('createdAt').textContent = new Date(session.created_at).toLocaleString('id-ID');
    document.getElementById('apiKey').value = session.api_key;
}

// ✅ IMPROVEMENT: Fetch profile info dengan better error handling
async function fetchProfileInfo() {
    try {
        const data = await apiRequest(`${config.backendApiUrl}/api/profile/${sessionId}`);
        
        // Update UI dengan data profil
        document.getElementById('profileName').textContent = data.name || 'Nama tidak tersedia';
        document.getElementById('waNumber').textContent = data.number || '-';
        
        console.log('Profile info loaded successfully');
    } catch (error) {
        console.error('Fetch profile info error:', error);
        
        // Jangan ganggu user dengan toast kalo profile fetch gagal
        // Karena ini bukan critical error
        // Status masih bisa update lewat polling
        
        // Optional: Bisa retry setelah beberapa detik
        if (error.status !== 404) {
            setTimeout(() => {
                if (profileFetched) { // Only retry if still considered "fetched" state
                    fetchProfileInfo();
                }
            }, 10000); // Retry after 10 seconds
        }
    }
}

// Update status
async function updateStatus() {
    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/status`);
        
        if (data.success) {
            const statusBadge = document.getElementById('statusBadge');
            statusBadge.textContent = data.status;
            statusBadge.className = 'badge';
            
            if (data.status === 'online' || data.status === 'connected') {
                statusBadge.classList.add('bg-success');
                document.getElementById('pairingSection').style.display = 'none';

                // ✅ Fetch profile info once connected (dengan flag prevention)
                if (!profileFetched) {
                    profileFetched = true;
                    fetchProfileInfo();
                }
            } else {
                statusBadge.classList.remove('bg-success');
                document.getElementById('pairingSection').style.display = 'block';
                profileFetched = false; // Reset flag when disconnected
                
                if (data.status === 'connecting') {
                    statusBadge.classList.add('bg-warning');
                    loadQrCode(); // Attempt to load QR code
                } else if (data.status === 'offline') {
                    statusBadge.classList.add('bg-secondary');
                } else {
                    statusBadge.classList.add('bg-secondary');
                }
            }
        }
    } catch (error) {
        console.error('Update status error:', error);
        // Silent fail untuk polling - jangan ganggu user
    }
}

// ✅ IMPROVEMENT: Load QR Code dengan proper error handling
async function loadQrCode() {
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Memuat QR Code...</p>
        </div>
    `;

    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/qr`, {
            method: 'POST'
        });

        if (data.qr) {
            qrContainer.innerHTML = `
                <img src="${data.qr}" alt="QR Code" class="img-fluid" style="max-width: 300px;">
                <p class="mt-2 text-muted">Pindai QR code dengan WhatsApp</p>
            `;
        } else {
            // Already connected
            qrContainer.innerHTML = `<p class="text-success">Sudah terhubung. Status akan segera update.</p>`;
            
            // ✅ Trigger profile fetch jika belum
            if (!profileFetched) {
                profileFetched = true;
                fetchProfileInfo();
            }
        }
    } catch (error) {
        console.error('Load QR code error:', error);
        qrContainer.innerHTML = `
            <div class="alert alert-danger">
                <p class="mb-2"><strong>Gagal memuat QR Code</strong></p>
                <small>${error.message || 'Terjadi kesalahan'}</small>
            </div>
            <button class="btn btn-primary btn-sm mt-2" onclick="loadQrCode()">
                <i class="bi bi-arrow-repeat"></i> Coba Lagi
            </button>
        `;
    }
}

// Start status polling
function startStatusPolling() {
    if (statusPolling) {
        clearInterval(statusPolling);
    }
    statusPolling = setInterval(updateStatus, 5000); // Poll every 5 seconds
}

// Test send message
document.getElementById('testMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneNumber = document.getElementById('testPhoneNumber').value;
    const message = document.getElementById('testMessage').value;
    const sendBtn = e.target.querySelector('button[type="submit"]');

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mengirim...';
    
    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/test-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone_number: phoneNumber,
                message: message
            })
        });
        
        if (data.success) {
            showToast('success', 'Pesan tes berhasil dikirim');
            document.getElementById('testMessage').value = '';
        } else {
            throw new Error('Response tidak valid');
        }
    } catch (error) {
        console.error('Send test message error:', error);
        showToast('error', error.message || 'Gagal mengirim pesan');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="bi bi-send"></i> Kirim';
    }
});

// Regenerate API key
async function regenerateApiKey() {
    if (!confirm('Yakin ingin membuat ulang API key? Key yang lama akan menjadi tidak valid.')) {
        return;
    }
    
    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/regenerate-key`, {
            method: 'POST'
        });
        
        if (data.success && data.api_key) {
            document.getElementById('apiKey').value = data.api_key;
            showToast('success', 'API Key berhasil dibuat ulang');
        } else {
            throw new Error('Response tidak valid');
        }
    } catch (error) {
        console.error('Regenerate API key error:', error);
        showToast('error', error.message || 'Gagal membuat ulang API key');
    }
}

// Delete session
async function deleteSession() {
    if (!confirm('Yakin ingin menghapus sesi ini? Tindakan ini tidak dapat dibatalkan.')) {
        return;
    }
    
    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (data.success) {
            showToast('success', 'Sesi berhasil dihapus');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            throw new Error('Gagal menghapus sesi');
        }
    } catch (error) {
        console.error('Delete session error:', error);
        showToast('error', error.message || 'Gagal menghapus sesi');
    }
}

let webhooks = [];

// --- Webhook Functions ---
async function loadWebhooks() {
    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}`);
        
        if (data.success) {
            webhooks = data.webhooks || [];
            renderWebhooks();
        } else {
            throw new Error('Data webhook tidak valid');
        }
    } catch (error) {
        console.error('Load webhooks error:', error);
        showToast('error', error.message || 'Gagal memuat webhooks');
    }
}

function renderWebhooks() {
    const container = document.getElementById('webhooksContainer');
    if (webhooks.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3"><p>Belum ada webhook dikonfigurasi.</p></div>';
        return;
    }
    container.innerHTML = webhooks.map((webhook) => `
        <div class="card mb-2">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div style="flex-grow: 1; min-width: 0;">
                        <p class="mb-0 fw-bold text-break">${webhook.webhook_url}</p>
                        <small class="text-muted">Events: ${getWebhookEventsText(webhook.webhook_events)}</small>
                    </div>
                    <div class="d-flex align-items-center" style="flex-shrink: 0; margin-left: 1rem;">
                        <div class="form-check form-switch me-3">
                            <input class="form-check-input" type="checkbox" role="switch" 
                                   id="toggle-${webhook.id}" 
                                   ${webhook.is_active ? 'checked' : ''} 
                                   onchange="toggleWebhook(this, ${webhook.id})">
                            <label class="form-check-label" for="toggle-${webhook.id}">${webhook.is_active ? 'On' : 'Off'}</label>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" onclick="editWebhook(${webhook.id})"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteWebhook(${webhook.id})"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function getWebhookEventsText(events) {
    try {
        const parsed = typeof events === 'string' ? JSON.parse(events) : events;
        if (!parsed || typeof parsed !== 'object') return 'invalid format';
        const enabled = Object.keys(parsed).filter(k => parsed[k]);
        return enabled.length > 0 ? enabled.join(', ') : 'none';
    } catch (e) {
        return 'invalid format';
    }
}

function addWebhook() {
    document.getElementById('webhookModalTitle').textContent = 'Tambah Webhook';
    document.getElementById('webhookForm').reset();
    document.getElementById('webhookId').value = '';
    new bootstrap.Modal(document.getElementById('webhookModal')).show();
}

function editWebhook(id) {
    const webhook = webhooks.find(w => w.id === id);
    if (!webhook) return;

    document.getElementById('webhookModalTitle').textContent = 'Edit Webhook';
    document.getElementById('webhookForm').reset();
    document.getElementById('webhookId').value = webhook.id;
    document.getElementById('webhookUrl').value = webhook.webhook_url;

    try {
        const events = typeof webhook.webhook_events === 'string' ? JSON.parse(webhook.webhook_events) : webhook.webhook_events;
        if (events && typeof events === 'object') {
            for (const key in events) {
                const check = document.getElementById(`webhook${key.charAt(0).toUpperCase() + key.slice(1)}`);
                if (check) check.checked = events[key];
            }
        }
    } catch (e) {
        console.error('Error parsing webhook events:', e);
    }
    new bootstrap.Modal(document.getElementById('webhookModal')).show();
}

async function saveWebhook() {
    const id = document.getElementById('webhookId').value;
    const url = document.getElementById('webhookUrl').value;
    const events = {
        individual: document.getElementById('webhookIndividual').checked,
        group: document.getElementById('webhookGroup').checked,
        from_me: document.getElementById('webhookFromMe').checked,
        update_status: document.getElementById('webhookUpdateStatus').checked,
        image: document.getElementById('webhookImage').checked,
        video: document.getElementById('webhookVideo').checked,
        audio: document.getElementById('webhookAudio').checked,
        sticker: document.getElementById('webhookSticker').checked,
        document: document.getElementById('webhookDocument').checked,
    };

    const endpoint = id 
        ? `${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}/${id}` 
        : `${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}`;
    const method = id ? 'PUT' : 'POST';

    try {
        const data = await apiRequest(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                webhook_url: url, 
                webhook_events: events 
            })
        });
        
        if (data.success) {
            showToast('success', 'Webhook berhasil disimpan');
            bootstrap.Modal.getInstance(document.getElementById('webhookModal')).hide();
            loadWebhooks();
        } else {
            throw new Error('Gagal menyimpan webhook');
        }
    } catch (error) {
        console.error('Save webhook error:', error);
        showToast('error', error.message || 'Terjadi kesalahan');
    }
}

async function deleteWebhook(id) {
    if (!confirm('Anda yakin ingin menghapus webhook ini?')) return;

    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}/${id}`, {
            method: 'DELETE'
        });
        
        if (data.success) {
            showToast('success', 'Webhook berhasil dihapus');
            loadWebhooks();
        } else {
            throw new Error('Gagal menghapus webhook');
        }
    } catch (error) {
        console.error('Delete webhook error:', error);
        showToast('error', error.message || 'Gagal menghapus webhook');
    }
}

// Toggle Webhook Function
async function toggleWebhook(checkbox, id) {
    const label = checkbox.nextElementSibling;
    const originalState = checkbox.checked;
    const originalLabel = label.textContent;
    
    label.textContent = '...';
    checkbox.disabled = true;

    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}/${id}/toggle`, {
            method: 'PATCH'
        });
        
        if (data.success && data.webhook) {
            const newStatus = data.webhook.is_active;
            showToast('success', `Webhook ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`);
            
            // Update local data
            const webhookIndex = webhooks.findIndex(w => w.id === id);
            if (webhookIndex > -1) {
                webhooks[webhookIndex].is_active = newStatus;
            }
            
            label.textContent = newStatus ? 'On' : 'Off';
        } else {
            throw new Error('Response tidak valid');
        }
    } catch (error) {
        console.error('Toggle webhook error:', error);
        showToast('error', error.message || 'Gagal mengubah status');
        
        // Revert state
        checkbox.checked = originalState;
        label.textContent = originalLabel;
    } finally {
        checkbox.disabled = false;
    }
}

// --- Phone Pairing Functions ---

// Format nomor telepon otomatis dengan strip
document.getElementById('pairingPhone').addEventListener('input', (e) => {
    let input = e.target.value.replace(/\D/g, ''); // Hapus semua non-digit
    
    // Otomatis tambahkan 62 jika dimulai dengan 0
    if (input.startsWith('0')) {
        input = '62' + input.substring(1);
    }
    
    let formatted = '';
    if (input.length > 2) {
        formatted += input.substring(0, 2); // Kode negara (62)
        
        if (input.length > 2) {
            formatted += '-';
            let rest = input.substring(2);
            // Format sisa nomor per 4 digit
            const chunks = [];
            while (rest.length > 0) {
                chunks.push(rest.substring(0, 4));
                rest = rest.substring(4);
            }
            formatted += chunks.join('-');
        }
    } else {
        formatted = input;
    }
    
    e.target.value = formatted;
});

// Handle submit form pairing nomor
document.getElementById('phonePairingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneInput = document.getElementById('pairingPhone');
    // Hapus semua strip dan spasi untuk dikirim ke API
    const phoneNumber = phoneInput.value.replace(/[-\s]/g, ''); 
    const pairBtn = document.getElementById('pairPhoneBtn');
    const pairingCodeContainer = document.getElementById('pairingCodeContainer');
    const pairingCode = document.getElementById('pairingCode');

    if (!phoneNumber || phoneNumber.length < 10 || !phoneNumber.startsWith('62')) {
        showToast('error', 'Format nomor telepon tidak valid. Pastikan diawali 62.');
        return;
    }
    
    pairBtn.disabled = true;
    pairBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menghubungkan...';
    pairingCodeContainer.classList.add('d-none');

    try {
        const data = await apiRequest(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/pair-phone`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone_number: phoneNumber })
        });

        if (data.success && data.data && data.data.code) {
            // Jika sukses dan dapat kode pairing
            showToast('success', 'Kode pairing diterima! Masukkan di HP Anda.');
            pairingCode.textContent = data.data.code.replace(/(\d{3})(?=\d)/g, '$1 - '); // Format kode pairing
            pairingCodeContainer.classList.remove('d-none');
        } else if (data.use_qr) {
            // Backend minta gunakan QR instead
            showToast('info', 'Pairing nomor belum tersedia. Silakan gunakan Scan QR.');
            // Pindah ke tab QR
            new bootstrap.Tab(document.getElementById('qr-tab')).show();
        } else {
            throw new Error(data.message || 'Gagal melakukan pairing');
        }
    } catch (error) {
        console.error('Pair phone error:', error);
        let errorMsg = error.message || 'Terjadi kesalahan saat pairing.';
        if (error.data && error.data.use_qr) {
            errorMsg += ' Silakan gunakan Scan QR.';
            // Pindah ke tab QR
            new bootstrap.Tab(document.getElementById('qr-tab')).show();
        }
        showToast('error', errorMsg);
    } finally {
        pairBtn.disabled = false;
        pairBtn.innerHTML = '<i class="bi bi-link-45deg"></i> Hubungkan';
    }
});

// Utility functions
function copyApiKey() {
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.select();
    
    // Modern approach with fallback
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(apiKeyInput.value)
                .then(() => {
                    showToast('success', 'API Key berhasil disalin');
                })
                .catch(() => {
                    // Fallback to execCommand
                    if (document.execCommand('copy')) {
                        showToast('success', 'API Key berhasil disalin');
                    } else {
                        showToast('error', 'Gagal menyalin API Key');
                    }
                });
        } else {
            // Use execCommand as fallback
            if (document.execCommand('copy')) {
                showToast('success', 'API Key berhasil disalin');
            } else {
                showToast('error', 'Gagal menyalin API Key');
            }
        }
    } catch (e) {
        console.error('Copy error:', e);
        showToast('error', 'Gagal menyalin API Key');
    }
}

function showToast(type, message) {
    // Implementation of showToast
    // Make sure this function is properly implemented in your codebase
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Initial load
loadSessionDetails();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (statusPolling) clearInterval(statusPolling);
});
