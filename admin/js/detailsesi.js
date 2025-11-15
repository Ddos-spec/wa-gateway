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

    const btnDelete = document.getElementById('btn-delete');
    const apikeyInput = document.getElementById('apikey-input');
    const generateApikeyBtn = document.getElementById('generate-apikey');

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
    
    // --- Main Functions ---

    function updatePage(session) {
        if (!session) return;

        sessionIdDisplay.textContent = session.sessionId;
        userDisplay.innerHTML = `User: <strong>${session.owner || 'N/A'}</strong>`;

        statusBadge.textContent = session.status;
        statusBadge.className = 'badge ';
        if (session.status === 'CONNECTED') {
            statusBadge.classList.add('bg-success');
            showQrState('connected');
        } else if (session.status === 'DISCONNECTED' || session.status === 'ERROR' || session.status === 'UNPAIRED') {
            statusBadge.classList.add('bg-danger');
            showQrState('error');
        } else {
            statusBadge.classList.add('bg-warning', 'text-dark');
            showQrState('loading');
        }

        if (session.qr) {
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
                if (input && input.type === 'select-one') {
                    input.value = session.settings[key] ? '1' : '0';
                }
            }
            webhookList.innerHTML = '';
            if (session.settings.webhooks && Array.isArray(session.settings.webhooks)) {
                session.settings.webhooks.forEach(url => addWebhookField(url));
            }
        }

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

    async function fetchSessionData() {
        try {
            // UPDATED: Fetch specific session status directly
            const response = await fetch(`/api/v2/sessions/${sessionId}/status`);
            if (!response.ok) {
                 const error = await response.json();
                 throw new Error(error.message || 'Session not found');
            }
            const { data } = await response.json();
            if (data) {
                updatePage(data);
            } else {
                throw new Error('Session data is missing in the response.');
            }
        } catch (error) {
            console.error('Error fetching session data:', error);
            qrContainer.innerHTML = `<div class="alert alert-danger">Could not load session data: ${error.message}</div>`;
            configLoader.style.display = 'none';
        }
    }

    function initializeWebSocket() {
        fetch('/api/v1/ws-auth') // This endpoint is fine
            .then(res => res.json())
            .then(data => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}?token=${data.wsToken}`);
                
                ws.onopen = () => {
                    addLog('SYSTEM', 'Real-time connection established.');
                    // UPDATED: Subscribe to dashboard events to get all state changes
                    ws.send(JSON.stringify({ type: 'subscribe_dashboard' }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        // UPDATED: Listen for the specific event for this session
                        if (data.event === 'session-state-changed' && data.sessionId === sessionId) {
                            addLog('SYSTEM', `Status changed to ${data.status}: ${data.detail || ''}`);
                            // The getSession call is cheap and ensures we have the latest of everything
                            fetchSessionData(); 
                        }
                    } catch (error) {
                        console.error("Error processing WebSocket message:", error);
                    }
                };

                ws.onclose = () => {
                    addLog('SYSTEM', 'Connection lost. Reconnecting in 5 seconds...');
                    setTimeout(initializeWebSocket, 5000);
                };
                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    ws.close();
                };
            })
            .catch(error => console.error('Failed to get WebSocket auth token:', error));
    }

    function setupConfirmationModal(title, body, onConfirm) {
        confirmationModalTitle.textContent = title;
        confirmationModalBody.textContent = body;
        const newConfirmBtn = confirmationModalConfirmBtn.cloneNode(true);
        confirmationModalConfirmBtn.parentNode.replaceChild(newConfirmBtn, confirmationModalConfirmBtn);
        newConfirmBtn.addEventListener('click', () => {
            onConfirm();
            confirmationModal.hide();
        }, { once: true });
        confirmationModal.show();
    }

    // --- Event Listeners ---

    btnDelete.addEventListener('click', () => {
        setupConfirmationModal('Delete Session', `Are you sure you want to delete session ${sessionId}? This action cannot be undone.`, async () => {
            try {
                // UPDATED: Use v2 endpoint
                const response = await fetch(`/api/v2/sessions/${sessionId}`, { method: 'DELETE' });
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
            const formData = new FormData(settingsForm);
            const settings = { webhooks: [] };
            for (const [key, value] of formData.entries()) {
                if (key === 'webhook[]') {
                    if (value) settings.webhooks.push(value);
                } else {
                     settings[key] = value === '1'; // Convert '1'/'0' to boolean
                }
            }
            
            try {
                // UPDATED: Use v2 endpoint
                const response = await fetch(`/api/v2/sessions/${sessionId}/settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
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
    });
    
    generateApikeyBtn.addEventListener('click', () => {
        setupConfirmationModal('Generate New API Key', 'This will invalidate the old key. Are you sure?', async () => {
            try {
                // UPDATED: Use v2 endpoint
                const response = await fetch(`/api/v2/sessions/${sessionId}/regenerate-token`, { method: 'POST' });
                const result = await response.json();
                if (response.ok) {
                    apikeyInput.value = result.token;
                    alert('New API Key generated successfully!');
                } else {
                    throw new Error(result.message || 'Failed to generate new API Key');
                }
            } catch (error) {
                alert(`Error generating API Key: ${error.message}`);
            }
        });
    });

    // --- Initial Load ---
    fetchSessionData();
    initializeWebSocket();
});
