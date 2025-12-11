// admin/js/detailsesi.js

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');

    if (!sessionId) {
        alert('No session ID provided!');
        window.location.href = '/admin/dashboard.html';
        return;
    }

    // --- DOM Elements ---
    const statusBadge = document.getElementById('status-badge');
    const sessionIdDisplay = document.getElementById('session-id-display');
    const userDisplay = document.getElementById('user-display');
    
    const qrContainer = document.getElementById('qr-container');
    const qrPreview = document.getElementById('qr-preview');
    const displayConnected = document.getElementById('display-connected');
    const displayLoading = document.getElementById('display-loading');
    const displayError = document.getElementById('display-error');

    const btnScanQr = document.getElementById('btn-scan-qr');
    const btnPairingCode = document.getElementById('btn-pairing-code');
    const btnDelete = document.getElementById('btn-delete');

    const apikeyInput = document.getElementById('apikey-input');
    const generateApikeyBtn = document.getElementById('generate-apikey');

    // New elements for loading state and confirmation
    const configLoader = document.getElementById('config-loader');
    const settingsForm = document.getElementById('settings-form');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const confirmationModalEl = document.getElementById('confirmationModal');
    const confirmationModal = new bootstrap.Modal(confirmationModalEl);
    const confirmationModalTitle = document.getElementById('confirmationModalTitle');
    const confirmationModalBody = document.getElementById('confirmationModalBody');
    const confirmationModalConfirmBtn = document.getElementById('confirmationModalConfirmBtn');

    const webhookList = document.getElementById('webhook-list');
    const logsContainer = document.getElementById('logs');
    
    const pairingForm = document.getElementById('pairing-form');
    const phoneNumberInput = document.getElementById('phone-number');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');
    const settingsFeedback = document.getElementById('settings-feedback');
    let feedbackTimer = null;

    let sessionToken = null;

    // --- Main Functions ---

    function updatePage(session) {
        if (!session) return;

        sessionToken = session.token;
        sessionIdDisplay.textContent = session.sessionId;
        userDisplay.innerHTML = `User: <strong>${session.owner || 'N/A'}</strong>`;

        statusBadge.textContent = session.status;
        statusBadge.className = 'badge ';
        if (session.status === 'CONNECTED') {
            statusBadge.classList.add('bg-success');
            showQrState('connected');
        } else if (session.status === 'DISCONNECTED' || session.status === 'UNPAIRED') {
            statusBadge.classList.add('bg-danger');
            showQrState('error');
        } else {
            statusBadge.classList.add('bg-warning', 'text-dark');
            showQrState('loading');
        }

        if (session.status === 'GENERATING_QR' && session.qr) {
            showQrState('qr');
            qrPreview.innerHTML = '';
            new QRCode(qrPreview, { text: session.qr, width: 250, height: 250 });
        }
        
        if (session.token) {
            apikeyInput.value = session.token;
        }

        if (session.settings) {
            for (const key in session.settings) {
                const input = settingsForm.elements[key];
                if (input) {
                    if (input.type === 'select-one') {
                        input.value = session.settings[key] ? '1' : '0';
                    }
                }
            }
            webhookList.innerHTML = '';
            if (session.settings.webhooks && Array.isArray(session.settings.webhooks)) {
                session.settings.webhooks.forEach(url => addWebhookField(url));
            }
        }

        // Show form and hide loader
        configLoader.style.display = 'none';
        settingsForm.style.display = 'block';
    }
    
    function showQrState(state) {
        [qrPreview, displayConnected, displayLoading, displayError].forEach(el => el.classList.add('d-none'));
        if (state === 'qr') qrPreview.classList.remove('d-none');
        else if (state === 'connected') displayConnected.classList.remove('d-none');
        else if (state === 'loading') displayLoading.classList.remove('d-none');
        else if (state === 'error') displayError.classList.remove('d-none');
    }

    function showSettingsFeedback(message, variant = 'success') {
        if (!settingsFeedback) return;
        settingsFeedback.textContent = message;
        settingsFeedback.className = `alert alert-${variant}`;
        settingsFeedback.classList.remove('d-none');
        if (feedbackTimer) {
            clearTimeout(feedbackTimer);
        }
        feedbackTimer = setTimeout(() => {
            settingsFeedback.classList.add('d-none');
        }, 4000);
    }

    async function fetchSessionData() {
        try {
            const response = await fetch('/api/v1/sessions');
            if (!response.ok) throw new Error('Failed to fetch sessions');
            const sessions = await response.json();
            const currentSession = sessions.find(s => s.sessionId === sessionId);
            if (currentSession) {
                updatePage(currentSession);
            } else {
                alert('Session not found!');
                window.location.href = '/admin/dashboard.html';
            }
        } catch (error) {
            console.error('Error fetching session data:', error);
            configLoader.innerHTML = `<div class="alert alert-danger">Could not load session data.</div>`;
        }
    }

    function initializeWebSocket() {
        fetch('/api/v1/ws-auth')
            .then(res => res.json())
            .then(data => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}?token=${data.wsToken}`);
                ws.onopen = () => addLog('SYSTEM', 'Log stream connected.');
                ws.onmessage = (event) => {
                    const logData = JSON.parse(event.data);
                    if (logData.type === 'session-update') {
                        const updatedSession = logData.data.find(s => s.sessionId === sessionId);
                        if (updatedSession) updatePage(updatedSession);
                    } else if (logData.type === 'log' && (logData.sessionId === sessionId || !logData.sessionId)) {
                         addLog(logData.sessionId || 'SYSTEM', logData.message);
                    }
                };
                ws.onclose = () => {
                    addLog('SYSTEM', 'Log stream disconnected. Reconnecting in 5 seconds...');
                    setTimeout(initializeWebSocket, 5000);
                };
                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    ws.close();
                };
            })
            .catch(error => console.error('Failed to get WebSocket auth token:', error));
    }

    // --- Confirmation Modal Logic ---
    function setupConfirmationModal(title, body, onConfirm) {
        confirmationModalTitle.textContent = title;
        confirmationModalBody.textContent = body;

        // Clone and replace the button to remove old event listeners
        const newConfirmBtn = confirmationModalConfirmBtn.cloneNode(true);
        confirmationModalConfirmBtn.parentNode.replaceChild(newConfirmBtn, confirmationModalConfirmBtn);
        
        newConfirmBtn.addEventListener('click', () => {
            onConfirm();
            confirmationModal.hide();
        }, { once: true }); // Ensure the event listener only runs once

        confirmationModal.show();
    }

    // --- Event Listeners ---

    btnScanQr.addEventListener('click', async () => {
        showQrState('loading');
        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}/qr`, { credentials: 'same-origin' });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.message || 'Failed to get QR code');
            }
            
            // Fallback: Force refresh data after 3 seconds in case WebSocket is slow/disconnected
            // This ensures the QR code appears even if the live stream misses a beat
            setTimeout(() => {
                fetchSessionData();
            }, 3000);
            
        } catch (error) {
            console.error('Error getting QR code:', error);
            alert('Error getting QR code: ' + error.message);
            showQrState('error');
        }
    });

    btnDelete.addEventListener('click', () => {
        setupConfirmationModal('Delete Session', `Are you sure you want to delete session ${sessionId}? This action cannot be undone.`, async () => {
            if (!sessionToken) {
                alert('Session token not available. Cannot delete.');
                return;
            }
            try {
                const response = await fetch(`/api/v1/sessions/${sessionId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${sessionToken}` }
                });
                const result = await response.json();
                if (response.ok) {
                    alert(result.message);
                    window.location.href = '/admin/dashboard.html';
                } else {
                    throw new Error(result.message || 'Failed to delete session');
                }
            } catch (error) {
                alert(`An error occurred while deleting the session: ${error.message}`);
            }
        });
    });
    
    saveConfigBtn.addEventListener('click', () => {
        setupConfirmationModal('Save Configuration', 'Are you sure you want to save these settings?', async () => {
            if (!sessionToken) {
                alert('Session token not available. Cannot save settings.');
                return;
            }
            
            const formData = new FormData(settingsForm);
            const settings = { webhooks: [] }; // Initialize webhooks as an array
            for (const [key, value] of formData.entries()) {
                if (key === 'webhook[]') {
                    if (value) settings.webhooks.push(value); // Only add non-empty URLs
                } else {
                     settings[key] = value;
                }
            }
            
            Object.keys(settings).forEach(key => {
                if (settings[key] === '1') settings[key] = true;
                if (settings[key] === '0') settings[key] = false;
            });

            try {
                const response = await fetch(`/api/v1/sessions/${sessionId}/settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify(settings)
                });
                const result = await response.json();
                if (response.ok) {
                    showSettingsFeedback('Settings saved successfully!', 'success');
                    fetchSessionData();
                } else {
                    throw new Error(result.message || 'Failed to save settings');
                }
            } catch (error) {
                showSettingsFeedback(`Error saving settings: ${error.message}`, 'danger');
            }
        });
    });
    
    generateApikeyBtn.addEventListener('click', () => {
        setupConfirmationModal('Generate New API Key', 'Are you sure you want to generate a new API Key for this session? The old key will become invalid.', async () => {
            try {
                const response = await fetch(`/api/v1/sessions/${sessionId}/generate-token`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${sessionToken}` }
                });

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const textError = await response.text();
                    throw new Error(`Server responded with non-JSON content (Status: ${response.status}): ${textError.substring(0, 100)}...`);
                }

                const result = await response.json();
                if (response.ok) {
                    apikeyInput.value = result.token; // Update the input field with the new token
                    sessionToken = result.token; // Update the in-memory sessionToken
                    alert('New API Key generated successfully!');
                    // Optionally, refresh session data to ensure consistency
                    fetchSessionData();
                } else {
                    throw new Error(result.message || 'Failed to generate new API Key');
                }
            } catch (error) {
                alert(`Error generating API Key: ${error.message}`);
            }
        });
    });

    pairingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = phoneNumberInput.value;
        if (!phone) return;
        
        pairingCodeDisplay.innerHTML = '<span class="text-primary spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Requesting code...';
        
        try {
            // Step 1: Initiate Pairing
            const initResponse = await fetch('/api/v1/session/pair-phone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // No Bearer token needed here if using session cookie (credentials: same-origin implied)
                },
                body: JSON.stringify({ phoneNumber: phone, sessionId: sessionId })
            });
            
            const initResult = await initResponse.json();
            if (!initResponse.ok) {
                throw new Error(initResult.message || 'Failed to initiate pairing');
            }

            // Step 2: Poll for Code
            let attempts = 0;
            const maxAttempts = 30; // 60 seconds timeout
            
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const statusResponse = await fetch(`/api/v1/session/${sessionId}/pair-status`);
                    const statusResult = await statusResponse.json();
                    
                    if (statusResult.status === 'success' && statusResult.pairingCode) {
                        clearInterval(pollInterval);
                        // Format code nicely (e.g. ABC-DEF)
                        const code = statusResult.pairingCode;
                        const formattedCode = code.match(/.{1,4}/g).join('-');
                        
                        pairingCodeDisplay.innerHTML = `
                            <div class="alert alert-success text-center">
                                <div class="fs-4 fw-bold font-monospace mb-2">${formattedCode}</div>
                                <div class="small text-muted">Enter this code on your phone</div>
                            </div>
                        `;
                    } else if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        pairingCodeDisplay.innerHTML = '<span class="text-danger">Timeout waiting for code. Please try again.</span>';
                    } else if (statusResult.sessionStatus === 'CONNECTED') {
                         clearInterval(pollInterval);
                         pairingCodeDisplay.innerHTML = '<span class="text-success">Device already connected!</span>';
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                    // Don't stop polling on transient network errors
                }
            }, 2000); // Poll every 2 seconds

        } catch (error) {
            console.error('Pairing error:', error);
            pairingCodeDisplay.innerHTML = `<span class="text-danger">Error: ${error.message}</span>`;
        }
    });

    // --- Initial Load ---
    fetchSessionData();
    initializeWebSocket();
});
