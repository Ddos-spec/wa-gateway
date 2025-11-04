
// --- GLOBAL CONFIG & STATE ---
let session = null;
let statusPollingInterval = null;
let countdownInterval = null;
const COUNTDOWN_SECONDS = 300; // 5 minutes

// --- INITIALIZATION ---
window.onerror = function(message, source, lineno, colno, error) {
    showErrorOverlay(message, source, lineno, colno, error);
};

// Check authentication and get session name from URL
if (!checkAuth()) {
    window.location.href = 'index.html';
}
const urlParams = new URLSearchParams(window.location.search);
const sessionName = urlParams.get('session');
if (!sessionName) {
    alert('Session ID tidak ditemukan di URL.');
    window.location.href = 'dashboard.html';
}

// --- API HELPER ---
async function apiRequest(endpoint, options = {}) {
    const url = `${config.backendApiUrl}${endpoint}`;
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `HTTP error! Status: ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error(`API Request Failed: ${endpoint}`, error);
        throw error;
    }
}

// --- CORE LOGIC ---
async function loadSessionDetails() {
    try {
        const data = await apiRequest(`/session/${sessionName}`);
        session = data.session;
        renderSessionDetails();
        updateStatus(session.status); // Initial status update
        startStatusPolling();
    } catch (error) {
        showToast('error', `Gagal memuat sesi: ${error.message}`);
        setTimeout(() => window.location.href = 'dashboard.html', 2000);
    }
}

function renderSessionDetails() {
    document.getElementById('sessionName').textContent = session.session_name;
    document.getElementById('profileName').textContent = session.profile_name || 'Belum terhubung';
    document.getElementById('waNumber').textContent = session.wa_number || '-';
    document.getElementById('apiKey').value = session.api_key;
}

function updateStatus(status) {
    const statusBadge = document.getElementById('statusBadge');
    const pairingSection = document.getElementById('pairingSection');
    statusBadge.textContent = status;
    statusBadge.className = 'badge'; // Reset classes

    if (status === 'online' || status === 'connected') {
        statusBadge.classList.add('bg-success');
        pairingSection.classList.add('d-none');
        stopCountdown(); // Stop any active countdown
        // Redirect if coming from a successful pairing
        if (pairingSection.dataset.justPaired) {
            showToast('success', '✅ Terhubung!');
            setTimeout(() => window.location.href = 'dashboard.html', 1500);
        }
    } else {
        pairingSection.classList.remove('d-none');
        statusBadge.classList.add(status === 'connecting' ? 'bg-warning' : 'bg-secondary');
    }
}

// --- PAIRING LOGIC ---
function showQrPairing() {
    document.getElementById('phonePairing').classList.add('d-none');
    document.getElementById('qrPairing').classList.remove('d-none');
    stopCountdown();
}

function showPhonePairing() {
    document.getElementById('qrPairing').classList.add('d-none');
    // Use a small timeout to ensure the element is rendered before it's interacted with
    setTimeout(() => {
        document.getElementById('phonePairing').classList.remove('d-none');
    }, 100);
}

async function startQrPairing() {
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>`;
    try {
        const data = await apiRequest('/session/start', {
            method: 'POST',
            body: JSON.stringify({ session: sessionName, pairingType: 'qr' }),
        });
        if (data.qr) {
            qrContainer.innerHTML = `<img src="${data.qr}" alt="QR Code" class="img-fluid" style="max-width: 250px;">`;
        } else {
             throw new Error("QR Code tidak diterima dari server.");
        }
    } catch (error) {
        qrContainer.innerHTML = `<div class="alert alert-danger small">${error.message}</div>`;
        showToast('error', error.message);
    }
}

async function startPhonePairing() {
    const phoneInput = document.getElementById('pairingPhone');
    const pairBtn = document.getElementById('pairPhoneBtn');
    let phoneNumber = phoneInput.value.replace(/\D/g, ''); // Hapus non-digit

    if (phoneNumber.startsWith('0')) {
        phoneNumber = '62' + phoneNumber.substring(1);
    }
    if (!phoneNumber.startsWith('62') || phoneNumber.length < 10) {
        showToast('error', 'Format nomor telepon salah. Gunakan 62xxxx');
        return;
    }

    pairBtn.disabled = true;
    pairBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Meminta kode...`;

    try {
        const data = await apiRequest('/session/start', {
            method: 'POST',
            body: JSON.stringify({ session: sessionName, pairingType: 'code', phone: phoneNumber }),
        });

        if (data.code) {
            document.getElementById('phoneFormContainer').classList.add('d-none');
            const codeDisplay = document.getElementById('codeDisplayContainer');
            document.getElementById('pairingCode').textContent = data.code;
            codeDisplay.classList.remove('d-none');
            startCountdown();
        } else {
            throw new Error(data.message || 'Gagal mendapatkan kode pairing.');
        }
    } catch (error) {
        showToast('error', error.message);
        resetPhonePairingUI();
    }
}

function resetPhonePairingUI() {
    const pairBtn = document.getElementById('pairPhoneBtn');
    pairBtn.disabled = false;
    pairBtn.innerHTML = `<i class="bi bi-phone"></i> Dapatkan Kode`;
    document.getElementById('phoneFormContainer').classList.remove('d-none');
    document.getElementById('codeDisplayContainer').classList.add('d-none');
    stopCountdown();
}

// --- COUNTDOWN TIMER ---
function startCountdown() {
    let timeLeft = COUNTDOWN_SECONDS;
    const countdownBar = document.getElementById('countdownBar');
    const countdownText = document.getElementById('countdownText');

    countdownInterval = setInterval(() => {
        timeLeft--;
        const percentage = (timeLeft / COUNTDOWN_SECONDS) * 100;
        countdownBar.style.width = `${percentage}%`;

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdownText.textContent = `Kode akan kedaluwarsa dalam ${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (timeLeft <= 0) {
            stopCountdown();
            showToast('error', 'Kode pairing kedaluwarsa. Silakan minta kode baru.');
            resetPhonePairingUI();
        }
    }, 1000);
}

function stopCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = null;
    document.getElementById('countdownBar').style.width = '100%';
    document.getElementById('countdownText').textContent = `Kode akan kedaluwarsa dalam 5:00`;
}

// --- UTILITY & EVENT HANDLERS ---
function copyPairingCode() {
    const code = document.getElementById('pairingCode').textContent;
    navigator.clipboard.writeText(code.replace(/-/g, '')).then(() => {
        showToast('success', 'Kode berhasil disalin!');
    });
}

async function cancelPairing() {
    if (!confirm('Anda yakin ingin membatalkan proses pairing?')) return;
    try {
        await apiRequest(`/session/${sessionName}/cancel`, { method: 'POST' });
        showToast('info', 'Proses pairing dibatalkan.');
        resetPhonePairingUI();
        showQrPairing(); // Kembali ke default
    } catch (error) {
        showToast('error', `Gagal membatalkan: ${error.message}`);
    }
}

function requestNewCode() {
    resetPhonePairingUI();
    startPhonePairing();
}

function startStatusPolling() {
    if (statusPollingInterval) clearInterval(statusPollingInterval);
    statusPollingInterval = setInterval(async () => {
        try {
            const data = await apiRequest(`/session/${sessionName}`);
            if (data.session.status !== session.status) {
                session.status = data.session.status;
                if (session.status === 'online') {
                    // Mark as just paired to trigger success flow
                    document.getElementById('pairingSection').dataset.justPaired = "true";
                }
                updateStatus(session.status);
            }
        } catch (error) {
            // silent fail for polling
        }
    }, 5000); // Poll every 5 seconds
}


// --- OTHER FUNCTIONS ---
async function regenerateApiKey() {
    if (!confirm('Yakin ingin membuat ulang API key?')) return;
    try {
        const data = await apiRequest(`/session/${sessionName}/regenerate-key`, { method: 'POST' });
        document.getElementById('apiKey').value = data.api_key;
        showToast('success', 'API Key berhasil dibuat ulang.');
    } catch (error) {
        showToast('error', `Gagal: ${error.message}`);
    }
}

function copyApiKey() {
    const apiKeyInput = document.getElementById('apiKey');
    navigator.clipboard.writeText(apiKeyInput.value).then(() => {
        showToast('success', 'API Key berhasil disalin!');
    });
}

async function deleteSession() {
    if (!confirm('YAKIN ingin menghapus sesi ini? Tindakan ini tidak dapat dibatalkan.')) return;
    try {
        await apiRequest(`/session/${sessionName}`, { method: 'DELETE' });
        showToast('success', 'Sesi berhasil dihapus.');
        setTimeout(() => window.location.href = 'dashboard.html', 1500);
    } catch (error) {
        showToast('error', `Gagal menghapus: ${error.message}`);
    }
}

// --- INITIAL LOAD ---
document.addEventListener('DOMContentLoaded', () => {
    loadSessionDetails();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (statusPollingInterval) clearInterval(statusPollingInterval);
    if (countdownInterval) clearInterval(countdownInterval);
});

// Dummy functions to prevent errors if not defined elsewhere
function checkAuth() { return !!localStorage.getItem('jwt_token'); }
function getToken() { return localStorage.getItem('jwt_token'); }
function showToast(type, message) {
    // A real implementation would show a UI element
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(`[${type.toUpperCase()}] ${message}`);
}
function showErrorOverlay(message, source, lineno, colno, error) {
     const errorContainer = document.getElementById('error-container');
     const errorDetails = document.getElementById('error-details');
     if (errorContainer && errorDetails) {
         errorDetails.textContent = `Pesan: ${message}\nSumber: ${source}\nBaris: ${lineno}\nKolom: ${colno}\nError: ${error ? error.stack : 'N/A'}`;
         errorContainer.style.display = 'block';
     }
}
const config = {
    backendApiUrl: 'http://localhost:5001'
};
