// admin/js/dashboard.js
document.addEventListener('auth-success', function() {
    const sessionsContainer = document.getElementById('sessions-container');
    const logBox = document.getElementById('log-box');
    const sessionsData = new Map();

    // --- System Monitoring ---
    function updateSystemStats(sessions) {
        const total = sessions.length;
        const active = sessions.filter(s => s.status === 'CONNECTED').length;
        const pending = sessions.filter(s => s.status === 'PAIRING' || s.status === 'CONNECTING' || s.status === 'SCAN_QR').length;
        const failed = sessions.filter(s => s.status === 'DISCONNECTED' || s.status === 'ERROR' || s.status === 'FAILED').length;

        document.getElementById('total-sessions').textContent = total;
        document.getElementById('active-sessions').textContent = active;
        document.getElementById('pending-sessions').textContent = pending;
        document.getElementById('failed-sessions').textContent = failed;
    }

    // --- Main Dashboard Logic ---

    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4 mb-4';
        card.id = `session-${session.sessionId}`;
        
        const ownerInfo = session.owner ? `<small class="text-muted d-block mb-2">Owner: ${session.owner}</small>` : '';
        const canDelete = Auth.currentUser.role === 'admin' || session.owner === Auth.currentUser.email;
        const deleteButton = canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteSession('${session.sessionId}')">Delete</button>` : '';
        const detailButton = `<a href="/admin/detailsesi.html?sessionId=${session.sessionId}" class="btn btn-sm btn-primary">Details</a>`;

        card.innerHTML = `
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title mb-1"><strong>${session.sessionId}</strong></h5>
                    ${ownerInfo}
                    <div class="mt-auto">
                        <div id="qr-container-${session.sessionId}" class="text-center my-3" style="min-height: 50px;"></div>
                        <span class="badge w-100" id="status-${session.sessionId}"></span>
                        <div class="d-flex justify-content-end gap-2 mt-3">
                            ${detailButton}
                            ${deleteButton}
                        </div>
                    </div>
                </div>
            </div>`;
        return card;
    }

    function updateSessionCards(sessions) {
        sessions.forEach(s => sessionsData.set(s.sessionId, s));
        
        const existingCardIds = Array.from(sessionsContainer.children).map(c => c.id);
        const fetchedSessionIds = sessions.map(s => `session-${s.sessionId}`);
        
        existingCardIds.forEach(cardId => {
            if (!fetchedSessionIds.includes(cardId)) {
                const cardToRemove = document.getElementById(cardId);
                cardToRemove?.remove();
            }
        });

        sessions.forEach(session => {
            if (!session.sessionId) return;

            let card = document.getElementById(`session-${session.sessionId}`);
            if (!card) {
                card = createSessionCard(session);
                sessionsContainer.appendChild(card);
            }

            const statusEl = document.getElementById(`status-${session.sessionId}`);
            if (!statusEl) return;

            statusEl.textContent = `${session.status}${session.detail ? ': ' + session.detail : ''}`;
            statusEl.className = 'badge w-100 ';
            if (session.status === 'CONNECTED') statusEl.classList.add('bg-success');
            else if (session.status === 'DISCONNECTED' || session.status === 'ERROR') statusEl.classList.add('bg-danger');
            else statusEl.classList.add('bg-warning', 'text-dark');

            const qrContainer = document.getElementById(`qr-container-${session.sessionId}`);
            if (session.qr) {
                qrContainer.innerHTML = ''; // Clear previous QR
                new QRCode(qrContainer, { text: session.qr, width: 128, height: 128 });
                statusEl.textContent = 'SCAN_QR';
            } else {
                qrContainer.innerHTML = '';
            }
        });
    }

    async function fetchSessions() {
        try {
            const response = await fetch('/api/v2/sessions'); // UPDATED
            if (!response.ok) throw new Error('Failed to fetch sessions');
            const { data } = await response.json();
            updateSessionCards(data);
            updateSystemStats(data);
        } catch (error) {
            console.error('Error fetching sessions:', error);
            sessionsContainer.innerHTML = `<div class="col"><div class="alert alert-danger">Could not load sessions.</div></div>`;
        }
    }

    window.clearLogs = function() {
        logBox.innerHTML = '<p class="text-muted">Logs cleared.</p>';
    }

    window.deleteSession = async function(sessionId) {
        if (!confirm(`Are you sure you want to delete session ${sessionId}?`)) return;
        try {
            // UPDATED: Use v2 endpoint and cookie-based auth (no Authorization header needed)
            const response = await fetch(`/api/v2/sessions/${sessionId}`, {
                method: 'DELETE',
            });
            const result = await response.json();
            if (response.ok) {
                alert(result.message);
                const cardToRemove = document.getElementById(`session-${sessionId}`);
                cardToRemove?.remove();
            } else {
                throw new Error(result.message || 'Failed to delete session');
            }
        } catch (error) {
            alert(`An error occurred while deleting the session: ${error.message}`);
        }
    }

    function initializeWebSocket() {
        fetch('/api/v2/ws-auth')
            .then(res => res.json())
            .then(data => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}?token=${data.wsToken}`);

                ws.onopen = () => {
                    logBox.innerHTML = '<p class="text-success">Log stream connected.</p>';
                    // UPDATED: Explicitly subscribe to dashboard updates
                    ws.send(JSON.stringify({ type: 'subscribe_dashboard' }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        // UPDATED: Handle new event-based updates
                        if (data.event === 'session-list') {
                            updateSessionCards(data.data);
                            updateSystemStats(data.data);
                        } else if (data.event === 'session-state-changed') {
                            const sessionToUpdate = sessionsData.get(data.sessionId);
                            if (sessionToUpdate) {
                                sessionToUpdate.status = data.status;
                                sessionToUpdate.detail = data.detail;
                                sessionToUpdate.qr = data.qr;
                                updateSessionCards([sessionToUpdate]);
                            }
                            updateSystemStats(Array.from(sessionsData.values()));
                        } else if (data.event === 'session-deleted') {
                            const cardToRemove = document.getElementById(`session-${data.sessionId}`);
                            cardToRemove?.remove();
                            sessionsData.delete(data.sessionId);
                            updateSystemStats(Array.from(sessionsData.values()));
                        }
                        
                        // You can add a separate log handler if needed, but this simplifies the dashboard
                        const logMessage = `[${new Date(data.timestamp || Date.now()).toLocaleTimeString()}] [${data.sessionId || 'SYSTEM'}] Event: ${data.event}`;
                        const logEntry = document.createElement('div');
                        logEntry.textContent = logMessage;
                        logBox.appendChild(logEntry);
                        logBox.scrollTop = logBox.scrollHeight;

                    } catch (error) {
                        console.error("Error processing WebSocket message:", error);
                    }
                };

                ws.onclose = () => {
                    logBox.innerHTML += '<p class="text-danger">Connection lost. Reconnecting in 5 seconds...</p>';
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

    // ============================================
    // PAIRING MODAL LOGIC
    // ============================================

    let pairingWs = null;
    let currentSessionId = null;

    const modal = document.getElementById('createSessionModal');
    const phoneNumberInput = document.getElementById('phoneNumber');
    const startPairingBtn = document.getElementById('start-pairing-btn');
    const pairingStatus = document.getElementById('pairing-status');
    const statusMessage = document.getElementById('status-message');
    const pairingForm = document.getElementById('pairing-form');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');
    const pairingCodeEl = document.getElementById('pairing-code');
    const pairingSuccess = document.getElementById('pairing-success');
    const pairingError = document.getElementById('pairing-error');
    const errorMessage = document.getElementById('error-message');

    // Reset modal on close
    modal.addEventListener('hidden.bs.modal', function() {
        if (pairingWs) {
            pairingWs.close();
            pairingWs = null;
        }
        currentSessionId = null;
        phoneNumberInput.value = '';
        pairingStatus.style.display = 'none';
        pairingForm.style.display = 'block';
        pairingCodeDisplay.style.display = 'none';
        pairingSuccess.style.display = 'none';
        pairingError.style.display = 'none';
        startPairingBtn.disabled = false;
        startPairingBtn.innerHTML = '<i class="bi bi-play-circle"></i> Start Pairing';
    });

    startPairingBtn.addEventListener('click', async function() {
        const phoneNumber = phoneNumberInput.value.trim();

        if (!phoneNumber) {
            pairingError.style.display = 'block';
            errorMessage.textContent = 'Please enter a phone number';
            return;
        }

        try {
            startPairingBtn.disabled = true;
            startPairingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Connecting...';
            pairingError.style.display = 'none';
            pairingSuccess.style.display = 'none';

            // Get WebSocket token
            const authResponse = await fetch('/api/v2/ws-auth');
            if (!authResponse.ok) throw new Error('Failed to get WebSocket token');
            const { wsToken } = await authResponse.json();

            // Connect to WebSocket
            const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${wsToken}`;
            pairingWs = new WebSocket(wsUrl);

            pairingWs.onopen = async () => {
                pairingStatus.style.display = 'block';
                statusMessage.textContent = 'Starting pairing process...';

                // Start pairing
                const response = await fetch('/api/v2/pairing/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to start pairing');
                }

                const result = await response.json();
                currentSessionId = result.sessionId;

                // Subscribe to pairing updates
                pairingWs.send(JSON.stringify({
                    type: 'subscribe_pairing',
                    sessionId: currentSessionId
                }));

                statusMessage.textContent = 'Waiting for pairing code...';
            };

            pairingWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.pairingCode) {
                        // Show pairing code
                        pairingForm.style.display = 'none';
                        pairingCodeDisplay.style.display = 'block';
                        pairingCodeEl.textContent = data.pairingCode;
                        statusMessage.textContent = 'Enter this code in WhatsApp';
                    }

                    if (data.event === 'session-state-changed' && data.sessionId === currentSessionId) {
                        if (data.status === 'CONNECTED') {
                            // Success!
                            pairingStatus.style.display = 'none';
                            pairingCodeDisplay.style.display = 'none';
                            pairingSuccess.style.display = 'block';

                            setTimeout(() => {
                                const modalInstance = bootstrap.Modal.getInstance(modal);
                                modalInstance.hide();
                                fetchSessions(); // Refresh session list
                            }, 2000);
                        } else if (data.status === 'ERROR' || data.status === 'FAILED') {
                            throw new Error(data.detail || 'Pairing failed');
                        }
                    }
                } catch (error) {
                    console.error('Pairing error:', error);
                    showPairingError(error.message);
                }
            };

            pairingWs.onerror = (error) => {
                console.error('WebSocket error:', error);
                showPairingError('WebSocket connection error');
            };

            pairingWs.onclose = () => {
                if (pairingSuccess.style.display === 'none') {
                    // Connection closed before success
                    statusMessage.textContent = 'Connection lost. Please try again.';
                }
            };

        } catch (error) {
            console.error('Error initiating pairing:', error);
            showPairingError(error.message);
        }
    });

    function showPairingError(message) {
        pairingStatus.style.display = 'none';
        pairingCodeDisplay.style.display = 'none';
        pairingError.style.display = 'block';
        errorMessage.textContent = message;
        startPairingBtn.disabled = false;
        startPairingBtn.innerHTML = '<i class="bi bi-play-circle"></i> Start Pairing';
    }

    // Initial load
    fetchSessions();
    initializeWebSocket();

    // --- Phone Pairing Modal Logic ---
    const modalPairingForm = document.getElementById('modalPairingForm');
    const modalPhoneNumberInput = document.getElementById('modalPhoneNumber');
    const modalStep1 = document.getElementById('modal-step1');
    const modalStep2 = document.getElementById('modal-step2');
    const modalStep3 = document.getElementById('modal-step3');
    const modalPairingCodeDisplay = document.getElementById('modalPairingCodeDisplay');
    const modalBackToStep1 = document.getElementById('modalBackToStep1');
    const modalPairedPhoneNumber = document.getElementById('modalPairedPhoneNumber');
    const modalPairedSessionId = document.getElementById('modalPairedSessionId');
    const pairingModal = document.getElementById('pairingModal');

    let modalWs = null;

    // Reset modal when closed
    pairingModal.addEventListener('hidden.bs.modal', function () {
        if (modalWs) {
            modalWs.close();
            modalWs = null;
        }
        modalStep1.style.display = 'block';
        modalStep2.style.display = 'none';
        modalStep3.style.display = 'none';
        modalPhoneNumberInput.value = '';
        modalPairingCodeDisplay.innerHTML = '<div class="spinner-border text-primary" role="status"></div><span class="ms-2">Waiting for code...</span>';
    });

    // Function to connect to WebSocket for pairing updates
    async function connectModalWebSocket(sessionId) {
        if (modalWs) {
            modalWs.close();
        }

        try {
            // 1. Get a one-time WebSocket authentication token
            const authResponse = await fetch('/api/v1/ws-auth');
            if (!authResponse.ok) throw new Error('Failed to get WebSocket token');
            const { wsToken } = await authResponse.json();

            // 2. Establish WebSocket connection
            const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${wsToken}`;
            modalWs = new WebSocket(wsUrl);

            modalWs.onopen = () => {
                console.log('Modal WebSocket connection established.');
                // 3. Subscribe to pairing updates for the specific session
                modalWs.send(JSON.stringify({
                    type: 'subscribe_pairing',
                    sessionId: sessionId
                }));
            };

            modalWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Received modal pairing update:', data);

                    // Update pairing code display
                    if (data.pairingCode) {
                        modalPairingCodeDisplay.innerHTML = `<strong>${data.pairingCode}</strong>`;
                    }

                    // Handle connection success
                    if (data.status === 'CONNECTED') {
                        if (modalWs) modalWs.close();
                        modalPairedPhoneNumber.textContent = data.phoneNumber || 'N/A';
                        modalPairedSessionId.textContent = sessionId;
                        modalStep2.style.display = 'none';
                        modalStep3.style.display = 'block';

                        // Refresh sessions list
                        fetchSessions();
                    }

                    // Handle error or timeout
                    if (data.status === 'ERROR' || data.status === 'TIMEOUT') {
                        if (modalWs) modalWs.close();
                        alert(`Pairing failed: ${data.detail || 'An unknown error occurred.'}`);
                        modalStep2.style.display = 'none';
                        modalStep1.style.display = 'block';
                    }

                } catch (error) {
                    console.error('Error processing modal WebSocket message:', error);
                }
            };

            modalWs.onerror = (error) => {
                console.error('Modal WebSocket error:', error);
                alert('A connection error occurred. Please try again.');
            };

            modalWs.onclose = () => {
                console.log('Modal WebSocket connection closed.');
                modalWs = null;
            };

        } catch (error) {
            console.error('Failed to connect modal WebSocket:', error);
            alert('Could not establish a real-time connection. Please refresh and try again.');
        }
    }

    // Handle modal form submission - Step 1
    if (modalPairingForm) {
        modalPairingForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const phoneNumber = modalPhoneNumberInput.value.trim();
            if (!phoneNumber) {
                alert('Please enter a phone number');
                return;
            }

            const submitButton = this.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Initiating...';

            try {
                const formattedPhone = phoneNumber.replace(/\D/g, '');

                // Use the API v2 endpoint
                const response = await fetch('/api/v2/pairing/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ phoneNumber: formattedPhone })
                });

                if (response.status === 401) {
                    window.location.href = '/admin/login.html';
                    return;
                }

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                modalStep1.style.display = 'none';
                modalStep2.style.display = 'block';

                // Start listening for real-time updates
                connectModalWebSocket(data.sessionId);

            } catch (error) {
                console.error('Error initiating pairing:', error);
                alert('Error initiating pairing: ' + error.message);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Generate Pairing Code';
            }
        });
    }

    // Back to step 1 from modal
    if (modalBackToStep1) {
        modalBackToStep1.addEventListener('click', function() {
            if (modalWs) {
                modalWs.close();
            }
            modalStep2.style.display = 'none';
            modalStep1.style.display = 'block';
            modalPairingCodeDisplay.innerHTML = '<div class="spinner-border text-primary" role="status"></div><span class="ms-2">Waiting for code...</span>';
        });
    }
});
