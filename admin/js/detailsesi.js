document.addEventListener('DOMContentLoaded', () => {
    const sessionIdTitle = document.getElementById('session-id-title');
    const statusIndicator = document.getElementById('status-indicator');
    const sessionStatus = document.getElementById('session-status');
    const sessionDetail = document.getElementById('session-detail');
    const pairingCodeContainer = document.getElementById('pairing-code-container');
    const pairingCodeEl = document.getElementById('pairing-code');

    const sessionOwner = document.getElementById('session-owner');
    const sessionPhone = document.getElementById('session-phone');
    const apiTokenInput = document.getElementById('api-token');
    const copyTokenBtn = document.getElementById('copy-token-btn');
    const regenerateTokenBtn = document.getElementById('regenerate-token-btn');

    const webhookForm = document.getElementById('webhook-form');
    const webhookUrlInput = document.getElementById('webhook-url');
    const webhookSpinner = document.getElementById('webhook-spinner');

    const deleteSessionBtn = document.getElementById('delete-session-btn');
    const logoutLink = document.getElementById('logout-link');

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');

    if (!sessionId) {
        alert('Session ID tidak ditemukan!');
        window.location.href = '/dashboard.html';
        return;
    }

    sessionIdTitle.textContent = sessionId;
    let sessionDataCache = null; // To store session details
    let statusPollInterval;

    const showAlert = (message, type = 'danger') => {
        const alertContainer = document.createElement('div');
        alertContainer.className = `alert alert-${type} alert-dismissible fade show`;
        alertContainer.setAttribute('role', 'alert');
        alertContainer.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        document.querySelector('main').prepend(alertContainer);
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertContainer);
            bsAlert.close();
        }, 5000);
    };
    
    const updateStatusUI = (status, detail, pairingCode = null) => {
        sessionStatus.textContent = status;
        sessionDetail.textContent = detail || '...';
        statusIndicator.className = 'me-3'; // Reset classes

        switch (status) {
            case 'CONNECTED':
                statusIndicator.classList.add('bi', 'bi-check-circle-fill', 'text-success');
                pairingCodeContainer.style.display = 'none';
                break;
            case 'DISCONNECTED':
            case 'ERROR':
                statusIndicator.classList.add('bi', 'bi-x-circle-fill', 'text-danger');
                pairingCodeContainer.style.display = 'none';
                break;
            case 'PAIRING':
                statusIndicator.classList.add('spinner-border', 'text-warning');
                 if (pairingCode) {
                    pairingCodeEl.textContent = pairingCode;
                    pairingCodeContainer.style.display = 'block';
                }
                break;
            default:
                statusIndicator.classList.add('spinner-border', 'text-secondary');
                pairingCodeContainer.style.display = 'none';
        }
    };


    const fetchSessionStatus = async () => {
        try {
            // Using the new pairing status endpoint which also covers regular sessions
            const response = await fetch(`/api/v1/session/${sessionId}/pair-status`);

            if (response.status === 404) {
                updateStatusUI('NOT FOUND', 'Sesi ini tidak ditemukan atau sudah dihapus.');
                clearInterval(statusPollInterval); // Stop polling
                return;
            }

            if (!response.ok) {
                throw new Error('Gagal mengambil status sesi.');
            }

            const data = await response.json();
            updateStatusUI(data.sessionStatus, data.detail, data.pairingCode);

            // If session is found and details are not loaded yet, load them
            if (!sessionDataCache) {
                loadInitialData();
            }

        } catch (error) {
            console.error('Error fetching session status:', error);
            // Don't show alert for polling errors to avoid spamming user
        }
    };

    const loadInitialData = async () => {
        try {
            const response = await fetch('/api/v1/sessions');
            if (!response.ok) throw new Error('Gagal mengambil daftar sesi.');

            const sessions = await response.json();
            const sessionDetails = sessions.find(s => s.sessionId === sessionId);

            if (!sessionDetails) {
                 showAlert('Detail sesi tidak dapat ditemukan.');
                 sessionDataCache = {}; // Mark as loaded to prevent re-fetch
                 return;
            }

            sessionDataCache = sessionDetails;

            // Populate session info
            sessionOwner.textContent = sessionDetails.owner || 'Tidak diketahui';
            sessionPhone.textContent = sessionDetails.phoneNumber || 'Belum terhubung';

            // Populate API token
            apiTokenInput.value = sessionDetails.token;

            // Fetch and populate webhook settings
            const settingsResponse = await fetch(`/api/v1/sessions/${sessionId}/settings`, {
                headers: { 'Authorization': `Bearer ${sessionDetails.token}` }
            });
            if (settingsResponse.ok) {
                const settings = await settingsResponse.json();
                webhookUrlInput.value = settings.webhookUrl || '';
            } else {
                 console.warn('Gagal memuat pengaturan webhook.');
            }

        } catch (error) {
            showAlert(error.message);
        }
    };

    copyTokenBtn.addEventListener('click', () => {
        apiTokenInput.select();
        document.execCommand('copy');
        showAlert('Token API disalin ke clipboard!', 'success');
    });

    regenerateTokenBtn.addEventListener('click', async () => {
        if (!confirm('Apakah Anda yakin ingin membuat ulang token API? Token yang lama akan segera tidak valid.')) {
            return;
        }
        
        regenerateTokenBtn.disabled = true;
        regenerateTokenBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;

        try {
            // Auth is handled by session cookie, so no explicit token needed here.
            const response = await fetch(`/api/v1/sessions/${sessionId}/regenerate-token`, {
                method: 'POST',
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Gagal membuat ulang token.');
            }

            apiTokenInput.value = result.token;
            showAlert('Token API berhasil dibuat ulang!', 'success');

        } catch (error) {
            showAlert(error.message);
        } finally {
            regenerateTokenBtn.disabled = false;
            regenerateTokenBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Buat Ulang Token`;
        }
    });

    webhookForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        webhookSpinner.style.display = 'inline-block';
        
        const webhookUrl = webhookUrlInput.value.trim();
        const token = apiTokenInput.value;

        if (!token) {
            showAlert('Token API tidak tersedia. Tidak dapat menyimpan pengaturan.');
            webhookSpinner.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ webhookUrl: webhookUrl }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Gagal menyimpan pengaturan.');
            }

            showAlert('Pengaturan webhook berhasil disimpan.', 'success');

        } catch (error) {
            showAlert(error.message);
        } finally {
            webhookSpinner.style.display = 'none';
        }
    });


    deleteSessionBtn.addEventListener('click', async () => {
        if (!confirm(`Apakah Anda benar-benar yakin ingin menghapus sesi "${sessionId}"? Tindakan ini tidak dapat dibatalkan.`)) {
            return;
        }

        const token = apiTokenInput.value;
        if (!token) {
            showAlert('Token API tidak tersedia. Tidak dapat menghapus sesi.');
            return;
        }

        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });

            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert('Sesi berhasil dihapus.');
                window.location.href = '/dashboard.html';
            } else {
                throw new Error(result.message || 'Gagal menghapus sesi.');
            }
        } catch (error) {
            showAlert(error.message);
        }
    });

    logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('/api/v1/admin/logout', { method: 'POST' });
            if (response.ok) {
                window.location.href = '/login.html';
            } else {
                showAlert('Gagal keluar.');
            }
        } catch (error) {
            showAlert('Terjadi kesalahan jaringan.');
        }
    });


    // Initial fetch and start polling
    fetchSessionStatus();
    statusPollInterval = setInterval(fetchSessionStatus, 5000); // Poll every 5 seconds
});
