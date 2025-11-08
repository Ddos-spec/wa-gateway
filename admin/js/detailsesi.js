// admin/js/detailsesi.js

document.addEventListener('auth-success', function() {
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

    const settingsForm = document.getElementById('settings-form');
    const webhookList = document.getElementById('webhook-list');
    const addWebhookBtn = document.getElementById('add-webhook');

    const logsContainer = document.getElementById('logs');
    
    const pairingForm = document.getElementById('pairing-form');
    const phoneNumberInput = document.getElementById('phone-number');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');

    let sessionToken = null;

    // --- Main Functions ---

    function updatePage(session) {
        if (!session) return;

        // Store token
        sessionToken = session.token;

        // Update header
        sessionIdDisplay.textContent = session.sessionId;
        userDisplay.innerHTML = `User: <strong>${session.owner || 'N/A'}</strong>`;

        // Update status badge
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

        // Update QR Code
        if (session.status === 'GENERATING_QR' && session.qr) {
            showQrState('qr');
            qrPreview.innerHTML = '';
            new QRCode(qrPreview, { text: session.qr, width: 250, height: 250 });
        }
        
        // Update API Key
        if (session.token) {
            apikeyInput.value = session.token;
        }

        // Update Webhook Form (assuming settings are part of the session object)
        if (session.settings) {
            for (const key in session.settings) {
                const input = settingsForm.elements[key];
                if (input) {
                    if (input.type === 'select-one') {
                        input.value = session.settings[key] ? '1' : '0';
                    } else if (input.type === 'checkbox') {
                        input.checked = session.settings[key];
                    }
                }
            }
            // Populate webhook URLs
            webhookList.innerHTML = '';
            if (session.settings.webhooks && Array.isArray(session.settings.webhooks)) {
                session.settings.webhooks.forEach(url => addWebhookField(url));
            }
        }
    }
    
    function showQrState(state) {
        // Hide all
        [qrPreview, displayConnected, displayLoading, displayError].forEach(el => el.classList.add('d-none'));
        
        // Show one
        if (state === 'qr') {
            qrPreview.classList.remove('d-none');
        } else if (state === 'connected') {
            displayConnected.classList.remove('d-none');
        } else if (state === 'loading') {
            displayLoading.classList.remove('d-none');
        } else if (state === 'error') {
            displayError.classList.remove('d-none');
        }
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
            alert('Could not load session data.');
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
                        if (updatedSession) {
                            updatePage(updatedSession);
                        }
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
            .catch(error => {
                console.error('Failed to get WebSocket auth token:', error);
                setTimeout(initializeWebSocket, 5000);
            });
    }

    // --- Event Listeners ---

    btnScanQr.addEventListener('click', async () => {
        showQrState('loading');
        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}/qr`, { credentials: 'same-origin' });
            const result = await response.json();
            if (!response.ok && result.message && !result.message.includes('token')) {
                alert('Failed to get QR code: ' + (result.message || result.error));
                showQrState('error');
            }
        } catch (error) {
            console.error('Error getting QR code:', error);
            showQrState('error');
        }
    });

    btnDelete.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to delete session ${sessionId}?`)) return;
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
            alert(`An error occurred: ${error.message}`);
        }
    });
    
    generateApikeyBtn.addEventListener('click', () => {
        // This should ideally call an endpoint to generate a new token
        alert('This feature is not yet implemented. For now, copy the token from the dashboard.');
    });

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!sessionToken) {
            alert('Session token not available. Cannot save settings.');
            return;
        }
        
        const formData = new FormData(settingsForm);
        const settings = {};
        for (const [key, value] of formData.entries()) {
            if (key.endsWith('[]')) {
                const cleanKey = key.slice(0, -2);
                if (!settings[cleanKey]) {
                    settings[cleanKey] = [];
                }
                settings[cleanKey].push(value);
            } else {
                 settings[key] = value;
            }
        }
        
        // Convert '1'/'0' strings to booleans for select elements
        Object.keys(settings).forEach(key => {
            if (settings[key] === '1') settings[key] = true;
            if (settings[key] === '0') settings[key] = false;
        });

        try {
            // NOTE: This endpoint might not exist yet.
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
                alert('Settings saved successfully!');
                fetchSessionData();
            } else {
                throw new Error(result.message || 'Failed to save settings');
            }
        } catch (error) {
            alert(`Error saving settings: ${error.message}`);
        }
    });
    
    pairingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = phoneNumberInput.value;
        if (!phone) return;
        
        pairingCodeDisplay.textContent = 'Requesting code...';
        
        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}/pairing-code?phone=${phone}`, { credentials: 'same-origin' });
            const result = await response.json();
            if (response.ok) {
                pairingCodeDisplay.textContent = `Your Code: ${result.code}`;
            } else {
                throw new Error(result.message || 'Failed to get pairing code');
            }
        } catch (error) {
            pairingCodeDisplay.textContent = `Error: ${error.message}`;
        }
    });


    // --- Initial Load ---
    fetchSessionData();
    initializeWebSocket();
});
