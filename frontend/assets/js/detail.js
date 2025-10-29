// Check authentication
if (!checkAuth()) {
    throw new Error('Not authenticated');
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
let qrPolling = null;
let webhooks = [];

// Format phone number with dashes
function formatPhoneNumber(value) {
    // Remove all non-digit characters
    const cleaned = value.replace(/\D/g, '');
    
    // Apply format: 0812-3456-789
    if (cleaned.length <= 4) {
        return cleaned;
    } else if (cleaned.length <= 7) {
        return cleaned.slice(0, 4) + '-' + cleaned.slice(4);
    } else {
        return cleaned.slice(0, 4) + '-' + cleaned.slice(4, 7) + '-' + cleaned.slice(7, 11);
    }
}

// Add auto-format to phone input
document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('pairingPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            const formatted = formatPhoneNumber(e.target.value);
            e.target.value = formatted;
        });
    }
});

// Load session details
async function loadSessionDetails() {
    try {
        const response = await fetch(`${config.apiUrl}/session/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        console.log('Load session details response:', data);
        
        if (response.ok && data.session) {
            session = data.session;
            renderSessionDetails();
            updateStatus();
            startStatusPolling();
            loadWebhooks();
        } else {
            showToast('error', data.error || 'Gagal memuat detail session');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Load session details error:', error);
        showToast('error', 'Terjadi kesalahan saat memuat detail session');
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

// Update status
async function updateStatus() {
    try {
        const response = await fetch(`${config.apiUrl}/session/${sessionId}/status`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        console.log('Status update:', data);
        
        if (response.ok && data.success) {
            const statusBadge = document.getElementById('statusBadge');
            statusBadge.textContent = data.status;
            statusBadge.className = 'badge';
            
            if (data.status === 'online' || data.status === 'connected') {
                statusBadge.classList.add('bg-success');
                document.getElementById('pairingSection').style.display = 'none';
                if (qrPolling) clearInterval(qrPolling);
            } else {
                statusBadge.classList.remove('bg-success');
                document.getElementById('pairingSection').style.display = 'block';
                if (data.status === 'connecting') {
                    statusBadge.classList.add('bg-warning');
                } else if (data.status === 'offline') {
                    statusBadge.classList.add('bg-danger');
                    checkQRCode();
                } else {
                    statusBadge.classList.add('bg-secondary');
                }
            }
        }
    } catch (error) {
        console.error('Update status error:', error);
    }
}

// Start status polling
function startStatusPolling() {
    if (statusPolling) {
        clearInterval(statusPolling);
    }
    statusPolling = setInterval(updateStatus, 10000);
}

// Check QR code
async function checkQRCode() {
    try {
        const response = await fetch(`${config.apiUrl}/session/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ session: sessionId })
        });
        
        const data = await response.json();
        console.log('QR code check:', data);
        
        if (response.ok) {
            const qrContainer = document.getElementById('qrCodeContainer');
            
            if (data.qr) {
                qrContainer.innerHTML = `
                    <img src="${data.qr}" alt="QR Code" class="img-fluid" style="max-width: 300px;">
                    <p class="mt-2 text-muted">Scan QR code dengan WhatsApp</p>
                `;
                startQRPolling();
            } else if (data.message && data.message.includes('Already connected')) {
                qrContainer.innerHTML = '<p class="text-success"><i class="bi bi-check-circle"></i> Session sudah terhubung</p>';
                if (qrPolling) clearInterval(qrPolling);
            }
        }
    } catch (error) {
        console.error('Check QR code error:', error);
        const qrContainer = document.getElementById('qrCodeContainer');
        qrContainer.innerHTML = `
            <p class="text-muted">Gagal memuat QR Code</p>
            <button class="btn btn-primary btn-sm" onclick="checkQRCode()">
                <i class="bi bi-arrow-repeat"></i> Coba Lagi
            </button>
        `;
    }
}

// Start QR polling
function startQRPolling() {
    if (qrPolling) {
        clearInterval(qrPolling);
    }
    qrPolling = setInterval(checkQRCode, 5000);
}

// Phone Pairing Form Submit
document.getElementById('phonePairingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneInput = document.getElementById('pairingPhone');
    const phoneNumber = phoneInput.value.replace(/[-\s]/g, '');
    const pairBtn = document.getElementById('pairPhoneBtn');
    
    if (!phoneNumber) {
        showToast('error', 'Nomor telepon harus diisi');
        return;
    }
    
    pairBtn.disabled = true;
    pairBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menghubungkan...';
    
    try {
        const response = await fetch(`${config.apiUrl}/session/pair-phone`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ 
                session: sessionId, 
                phone: phoneNumber.startsWith('0') ? '62' + phoneNumber.substring(1) : phoneNumber 
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', 'Kode pairing berhasil dikirim!');
            
            if (data.code) {
                document.getElementById('pairingCodeContainer').classList.remove('d-none');
                document.getElementById('pairingCode').textContent = data.code;
            }
            
            // Start polling status
            startStatusPolling();
        } else {
            showToast('error', data.error || data.message || 'Gagal mengirim kode pairing');
        }
    } catch (error) {
        console.error('Phone pairing error:', error);
        showToast('error', 'Terjadi kesalahan saat menghubungkan nomor');
    } finally {
        pairBtn.disabled = false;
        pairBtn.innerHTML = '<i class="bi bi-link-45deg"></i> Hubungkan';
    }
});

// Load webhooks
async function loadWebhooks() {
    try {
        const response = await fetch(`${config.apiUrl}/api/webhooks/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            webhooks = data.webhooks || [];
            renderWebhooks();
        }
    } catch (error) {
        console.error('Load webhooks error:', error);
    }
}

// Render webhooks
function renderWebhooks() {
    const container = document.getElementById('webhooksContainer');
    
    if (webhooks.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-link-45deg" style="font-size: 48px;"></i>
                <p>Belum ada webhook. Klik "Tambah Webhook" untuk menambah.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = webhooks.map((webhook, index) => `
        <div class="card mb-3" data-webhook-id="${webhook.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">Webhook #${index + 1}</h6>
                        <p class="mb-1 text-break"><small>${webhook.webhook_url}</small></p>
                        <div class="form-check form-switch d-inline-block">
                            <input class="form-check-input" type="checkbox" 
                                id="webhook-toggle-${webhook.id}" 
                                ${webhook.is_active ? 'checked' : ''}
                                onchange="toggleWebhook(${webhook.id})">
                            <label class="form-check-label" for="webhook-toggle-${webhook.id}">
                                <small>${webhook.is_active ? 'Aktif' : 'Nonaktif'}</small>
                            </label>
                        </div>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="editWebhook(${webhook.id})" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="deleteWebhook(${webhook.id})" title="Hapus">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="mt-2">
                    <small class="text-muted">Events: ${getWebhookEventsText(webhook.webhook_events)}</small>
                </div>
            </div>
        </div>
    `).join('');
}

// Get webhook events text
function getWebhookEventsText(events) {
    if (!events || typeof events === 'string') {
        try {
            events = JSON.parse(events);
        } catch (e) {
            return 'N/A';
        }
    }
    
    const activeEvents = [];
    if (events.individual) activeEvents.push('Individual');
    if (events.group) activeEvents.push('Group');
    if (events.from_me) activeEvents.push('From Me');
    if (events.image) activeEvents.push('Image');
    if (events.video) activeEvents.push('Video');
    if (events.audio) activeEvents.push('Audio');
    if (events.document) activeEvents.push('Document');
    if (events.sticker) activeEvents.push('Sticker');
    
    return activeEvents.length > 0 ? activeEvents.join(', ') : 'Semua event nonaktif';
}

// Add webhook
function addWebhook() {
    document.getElementById('webhookModalTitle').textContent = 'Tambah Webhook';
    document.getElementById('webhookId').value = '';
    document.getElementById('webhookUrl').value = '';
    
    // Reset checkboxes
    document.getElementById('webhookIndividual').checked = true;
    document.getElementById('webhookGroup').checked = false;
    document.getElementById('webhookFromMe').checked = true;
    document.getElementById('webhookUpdateStatus').checked = true;
    document.getElementById('webhookImage').checked = false;
    document.getElementById('webhookVideo').checked = false;
    document.getElementById('webhookAudio').checked = false;
    document.getElementById('webhookSticker').checked = false;
    document.getElementById('webhookDocument').checked = false;
    
    const modal = new bootstrap.Modal(document.getElementById('webhookModal'));
    modal.show();
}

// Edit webhook
function editWebhook(webhookId) {
    const webhook = webhooks.find(w => w.id === webhookId);
    if (!webhook) return;
    
    document.getElementById('webhookModalTitle').textContent = 'Edit Webhook';
    document.getElementById('webhookId').value = webhook.id;
    document.getElementById('webhookUrl').value = webhook.webhook_url;
    
    let events = webhook.webhook_events;
    if (typeof events === 'string') {
        try {
            events = JSON.parse(events);
        } catch (e) {
            events = {};
        }
    }
    
    document.getElementById('webhookIndividual').checked = events.individual || false;
    document.getElementById('webhookGroup').checked = events.group || false;
    document.getElementById('webhookFromMe').checked = events.from_me || false;
    document.getElementById('webhookUpdateStatus').checked = events.update_status || false;
    document.getElementById('webhookImage').checked = events.image || false;
    document.getElementById('webhookVideo').checked = events.video || false;
    document.getElementById('webhookAudio').checked = events.audio || false;
    document.getElementById('webhookSticker').checked = events.sticker || false;
    document.getElementById('webhookDocument').checked = events.document || false;
    
    const modal = new bootstrap.Modal(document.getElementById('webhookModal'));
    modal.show();
}

// Save webhook
async function saveWebhook() {
    const webhookId = document.getElementById('webhookId').value;
    const webhookUrl = document.getElementById('webhookUrl').value;
    
    if (!webhookUrl) {
        showToast('error', 'Webhook URL harus diisi');
        return;
    }
    
    const webhookEvents = {
        individual: document.getElementById('webhookIndividual').checked,
        group: document.getElementById('webhookGroup').checked,
        from_me: document.getElementById('webhookFromMe').checked,
        update_status: document.getElementById('webhookUpdateStatus').checked,
        image: document.getElementById('webhookImage').checked,
        video: document.getElementById('webhookVideo').checked,
        audio: document.getElementById('webhookAudio').checked,
        sticker: document.getElementById('webhookSticker').checked,
        document: document.getElementById('webhookDocument').checked
    };
    
    try {
        const url = webhookId 
            ? `${config.apiUrl}/api/webhooks/${sessionId}/${webhookId}`
            : `${config.apiUrl}/api/webhooks/${sessionId}`;
        
        const method = webhookId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ 
                webhook_url: webhookUrl, 
                webhook_events: webhookEvents,
                is_active: true
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', webhookId ? 'Webhook berhasil diupdate' : 'Webhook berhasil ditambahkan');
            bootstrap.Modal.getInstance(document.getElementById('webhookModal')).hide();
            loadWebhooks();
        } else {
            showToast('error', data.error || 'Gagal menyimpan webhook');
        }
    } catch (error) {
        console.error('Save webhook error:', error);
        showToast('error', 'Terjadi kesalahan saat menyimpan webhook');
    }
}

// Toggle webhook
async function toggleWebhook(webhookId) {
    try {
        const response = await fetch(`${config.apiUrl}/api/webhooks/${sessionId}/${webhookId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', data.webhook.is_active ? 'Webhook diaktifkan' : 'Webhook dinonaktifkan');
            loadWebhooks();
        } else {
            showToast('error', data.error || 'Gagal mengubah status webhook');
            loadWebhooks(); // Reload to reset toggle
        }
    } catch (error) {
        console.error('Toggle webhook error:', error);
        showToast('error', 'Terjadi kesalahan saat mengubah status webhook');
        loadWebhooks();
    }
}

// Delete webhook
async function deleteWebhook(webhookId) {
    if (!confirm('Yakin ingin menghapus webhook ini?')) {
        return;
    }
    
    try {
        const response = await fetch(`${config.apiUrl}/api/webhooks/${sessionId}/${webhookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', 'Webhook berhasil dihapus');
            loadWebhooks();
        } else {
            showToast('error', data.error || 'Gagal menghapus webhook');
        }
    } catch (error) {
        console.error('Delete webhook error:', error);
        showToast('error', 'Terjadi kesalahan saat menghapus webhook');
    }
}

// Copy API key
function copyApiKey() {
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.select();
    navigator.clipboard.writeText(apiKeyInput.value).then(() => {
        showToast('success', 'API Key berhasil dicopy');
    }).catch(() => {
        document.execCommand('copy');
        showToast('success', 'API Key berhasil dicopy');
    });
}

// Regenerate API key
async function regenerateApiKey() {
    if (!confirm('Yakin ingin regenerate API key? API key lama akan tidak bisa digunakan.')) {
        return;
    }
    
    try {
        const response = await fetch(`${config.apiUrl}/session/${sessionId}/regenerate-key`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('apiKey').value = data.api_key;
            showToast('success', 'API Key berhasil di-regenerate');
        } else {
            showToast('error', data.error || 'Gagal regenerate API key');
        }
    } catch (error) {
        console.error('Regenerate API key error:', error);
        showToast('error', 'Terjadi kesalahan saat regenerate API key');
    }
}

// Test send message
document.getElementById('testMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneNumber = document.getElementById('testPhoneNumber').value;
    const message = document.getElementById('testMessage').value;
    
    try {
        const response = await fetch(`${config.apiUrl}/message/send-text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                session: sessionId,
                to: phoneNumber,
                text: message
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('success', 'Pesan test berhasil dikirim');
            document.getElementById('testMessage').value = '';
        } else {
            showToast('error', data.error || data.message || 'Gagal mengirim pesan');
        }
    } catch (error) {
        console.error('Send test message error:', error);
        showToast('error', 'Terjadi kesalahan saat mengirim pesan');
    }
});

// Delete session
async function deleteSession() {
    if (!confirm('Yakin ingin menghapus session ini? Tindakan ini tidak bisa dibatalkan.')) {
        return;
    }
    
    try {
        const response = await fetch(`${config.apiUrl}/session/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', 'Session berhasil dihapus');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            showToast('error', data.error || 'Gagal menghapus session');
        }
    } catch (error) {
        console.error('Delete session error:', error);
        showToast('error', 'Terjadi kesalahan saat menghapus session');
    }
}

// Load session details on page load
loadSessionDetails();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (statusPolling) clearInterval(statusPolling);
    if (qrPolling) clearInterval(qrPolling);
});