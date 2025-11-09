// admin/js/dashboard.js
document.addEventListener('auth-success', function() {
    // --- EXISTING DASHBOARD ELEMENTS ---
    const sessionsContainer = document.getElementById('sessions-container');
    const logBox = document.getElementById('log-box');
    const sessionsData = new Map();

    // --- NEW MODAL ELEMENTS ---
    const createSessionModal = new bootstrap.Modal(document.getElementById('createSessionModal'));
    const modalStep1 = document.getElementById('modal-step-1');
    const modalStep2 = document.getElementById('modal-step-2');
    const modalStepQr = document.getElementById('modal-step-qr');
    const modalStepPhoneNumber = document.getElementById('modal-step-phone-number');
    const modalStepPhoneCode = document.getElementById('modal-step-phone-code');
    const modalStepSuccess = document.getElementById('modal-step-success');

    const newSessionIdInput = document.getElementById('newSessionIdInput');
    const modalSessionName = document.getElementById('modalSessionName');
    const modalQrCodeDiv = document.getElementById('modal-qr-code');
    const modalQrStatus = document.getElementById('modal-qr-status');
    const modalPhoneNumberInput = document.getElementById('modalPhoneNumber');
    const modalPairingCodeDisplay = document.getElementById('modalPairingCodeDisplay');
    const successSessionId = document.getElementById('successSessionId');

    const modalNextBtn = document.getElementById('modalNextBtn');
    const modalBackBtn = document.getElementById('modalBackBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalPairQrBtn = document.getElementById('modalPairQrBtn');
    const modalPairPhoneBtn = document.getElementById('modalPairPhoneBtn');

    // --- MODAL STATE ---
    let currentStep = 1;
    let newSessionId = '';
    let phonePairingPollInterval = null;

    function resetModal() {
        currentStep = 1;
        newSessionId = '';
        if (phonePairingPollInterval) clearInterval(phonePairingPollInterval);

        // Reset all steps to hidden, show step 1
        [modalStep1, modalStep2, modalStepQr, modalStepPhoneNumber, modalStepPhoneCode, modalStepSuccess].forEach(step => step.style.display = 'none');
        modalStep1.style.display = 'block';

        // Reset inputs and displays
        newSessionIdInput.value = '';
        modalPhoneNumberInput.value = '';
        modalQrCodeDiv.innerHTML = '';
        modalQrStatus.textContent = 'Waiting for QR code...';
        modalPairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"></div><span class="ms-2">Waiting for code...</span>`;

        // Reset button states
        modalNextBtn.textContent = 'Next';
        modalNextBtn.style.display = 'block';
        modalBackBtn.style.display = 'none';
        modalCancelBtn.style.display = 'block';
    }

    function showStep(stepNumber) {
        [modalStep1, modalStep2, modalStepQr, modalStepPhoneNumber, modalStepPhoneCode, modalStepSuccess].forEach(step => step.style.display = 'none');
        
        let currentModalStep;
        switch (stepNumber) {
            case 1: currentModalStep = modalStep1; break;
            case 2: currentModalStep = modalStep2; break;
            case 3: // QR
                currentModalStep = modalStepQr;
                handleQrPairing();
                break;
            case 4: // Phone Number Input
                currentModalStep = modalStepPhoneNumber;
                break;
            case 5: // Phone Code Display
                currentModalStep = modalStepPhoneCode;
                handlePhonePairing();
                break;
            case 6: // Success
                currentModalStep = modalStepSuccess;
                break;
        }
        currentModalStep.style.display = 'block';
        currentStep = stepNumber;
        updateModalButtons();
    }

    function updateModalButtons() {
        modalBackBtn.style.display = 'none';
        modalNextBtn.style.display = 'block';
        modalCancelBtn.style.display = 'block';

        switch (currentStep) {
            case 1:
                modalNextBtn.textContent = 'Next';
                break;
            case 2:
                modalBackBtn.style.display = 'block';
                modalNextBtn.style.display = 'none';
                break;
            case 3: // QR
            case 5: // Phone Code
                modalBackBtn.style.display = 'block';
                modalNextBtn.style.display = 'none';
                break;
            case 4: // Phone Number
                modalBackBtn.style.display = 'block';
                modalNextBtn.textContent = 'Generate Code';
                break;
            case 6: // Success
                modalBackBtn.style.display = 'none';
                modalNextBtn.style.display = 'none';
                modalCancelBtn.textContent = 'Finish';
                break;
        }
    }

    modalNextBtn.addEventListener('click', () => {
        if (currentStep === 1) {
            newSessionId = newSessionIdInput.value.trim().replace(/[^a-zA-Z0-9-]/g, '');
            if (!newSessionId) {
                alert('Please enter a valid Session Name.');
                return;
            }
            modalSessionName.textContent = newSessionId;
            showStep(2);
        } else if (currentStep === 4) {
            showStep(5); // Move to phone code display step
        }
    });

    modalBackBtn.addEventListener('click', () => {
        if (phonePairingPollInterval) clearInterval(phonePairingPollInterval);
        
        if (currentStep === 3 || currentStep === 4) {
            showStep(2);
        } else if (currentStep === 2) {
            showStep(1);
        } else if (currentStep === 5) {
            showStep(4);
        }
    });

    document.getElementById('createSessionModal').addEventListener('hidden.bs.modal', resetModal);
    
    modalPairQrBtn.addEventListener('click', () => showStep(3));
    modalPairPhoneBtn.addEventListener('click', () => showStep(4));

    // --- PAIRING LOGIC ---

    async function handleQrPairing() {
        modalQrStatus.textContent = 'Creating session...';
        try {
            // 1. Create the session
            const createResponse = await fetch('/api/v1/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.token}` },
                body: JSON.stringify({ sessionId: newSessionId })
            });

            if (!createResponse.ok) {
                const result = await createResponse.json();
                throw new Error(result.message || 'Failed to create session');
            }
            
            modalQrStatus.textContent = 'Fetching QR code...';
            
            // 2. Get the QR code
            const qrResponse = await fetch(`/api/v1/sessions/${newSessionId}/qr`, { credentials: 'same-origin' });
            const qrResult = await qrResponse.json();

            if (!qrResponse.ok) {
                 throw new Error(qrResult.message || 'Failed to get QR code');
            }

            // The QR is received via WebSocket, but we can show a placeholder
            modalQrStatus.textContent = 'Waiting for you to scan...';
            // The main session-update websocket will handle the QR code display
            
        } catch (error) {
            modalQrStatus.textContent = `Error: ${error.message}`;
        }
    }

    async function handlePhonePairing() {
        const phoneNumber = modalPhoneNumberInput.value.trim();
        if (!phoneNumber) {
            alert('Please enter a phone number');
            showStep(4); // Go back
            return;
        }

        modalNextBtn.disabled = true;
        
        try {
            const formattedPhone = phoneNumber.replace(/\D/g, '');
            const response = await fetch('/api/v1/session/pair-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.token}` },
                body: JSON.stringify({ phoneNumber: formattedPhone })
            });

            if (response.status === 409) {
                alert('This phone number is already paired or in the process of pairing.');
                showStep(4);
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            startPhonePairingPolling(data.sessionId);

        } catch (error) {
            console.error('Error initiating pairing:', error);
            alert('Error initiating pairing: ' + error.message);
            showStep(4);
        } finally {
            modalNextBtn.disabled = false;
        }
    }

    function startPhonePairingPolling(sessionId) {
        if (phonePairingPollInterval) clearInterval(phonePairingPollInterval);

        phonePairingPollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/v1/session/${sessionId}/pair-status`);
                if (!response.ok) {
                    clearInterval(phonePairingPollInterval);
                    return;
                }
                const data = await response.json();

                if (data.pairingCode) {
                    modalPairingCodeDisplay.innerHTML = `<strong>${data.pairingCode}</strong>`;
                }

                if (data.sessionStatus === 'CONNECTED') {
                    clearInterval(phonePairingPollInterval);
                    successSessionId.textContent = sessionId;
                    showStep(6);
                    fetchSessions(); // Refresh dashboard
                }
            } catch (error) {
                console.error('Error during polling:', error);
                clearInterval(phonePairingPollInterval);
            }
        }, 2000);
    }

    // --- EXISTING DASHBOARD LOGIC (MODIFIED) ---

    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'col-md-6 mb-4';
        card.id = `session-${session.sessionId}`;
        
        const ownerInfo = session.owner ? `<small class="text-muted d-block mb-2">Owner: ${session.owner}</small>` : '';
        const canDelete = Auth.currentUser.role === 'admin' || session.owner === Auth.currentUser.email;
        const deleteButton = canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteSession('${session.sessionId}')">Delete</button>` : '';
        const detailButton = `<a href="/admin/detailsesi.html?sessionId=${session.sessionId}" class="btn btn-sm btn-outline-primary">Detail</a>`;

        card.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title mb-3"><span>Session: <strong>${session.sessionId}</strong></span></h5>
                    ${ownerInfo}
                    <div id="qr-container-${session.sessionId}" class="text-center my-2"></div>
                    <span class="badge status-badge mb-3" id="status-${session.sessionId}"></span>
                    <div class="d-flex justify-content-end gap-2 mt-3">${detailButton}${deleteButton}</div>
                </div>
            </div>`;
        return card;
    }

    function updateSessionCards(sessions) {
        sessions.forEach(s => sessionsData.set(s.sessionId, s));
        
        const existingCardIds = Array.from(sessionsContainer.children).map(c => c.id);
        const fetchedSessionIds = sessions.map(s => `session-${s.sessionId}`);
        existingCardIds.forEach(cardId => {
            if (!fetchedSessionIds.includes(cardId)) document.getElementById(cardId)?.remove();
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

            statusEl.textContent = `${session.status}${session.detail ? ' - ' + session.detail : ''}`;
            statusEl.className = 'badge status-badge ';
            if (session.status === 'CONNECTED') statusEl.classList.add('bg-success');
            else if (session.status === 'DISCONNECTED') statusEl.classList.add('bg-danger');
            else statusEl.classList.add('bg-warning', 'text-dark');

            // Handle QR code display
            const qrContainer = document.getElementById(`qr-container-${session.sessionId}`);
            const modalQrContainer = document.getElementById('modal-qr-code');

            if (session.qr) {
                const targetContainer = (currentStep === 3 && newSessionId === session.sessionId) ? modalQrContainer : qrContainer;
                targetContainer.innerHTML = '';
                new QRCode(targetContainer, { 
                    text: session.qr, 
                    width: 200, 
                    height: 200,
                    typeNumber: 10, // Equivalent to version 10
                    correctLevel: 3 // Equivalent to 'H' error correction
                });
                if(currentStep === 3) modalQrStatus.textContent = 'Please scan the QR code.';
            } else {
                // Check if the session is in a state where QR should be available
                if (session.status === 'GENERATING_QR' || session.status === 'AWAITING_QR') {
                    const targetContainer = (currentStep === 3 && newSessionId === session.sessionId) ? modalQrContainer : qrContainer;
                    targetContainer.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2">Waiting for QR code...</p></div>';
                } else {
                    qrContainer.innerHTML = '';
                }
            }
        });
    }

    async function fetchSessions() {
        try {
            const response = await fetch('/api/v1/sessions');
            if (!response.ok) throw new Error('Failed to fetch sessions');
            const sessions = await response.json();
            updateSessionCards(sessions);
        } catch (error) {
            console.error('Error fetching sessions:', error);
        }
    }

    window.deleteSession = async function(sessionId) {
        if (!confirm(`Are you sure you want to delete session ${sessionId}?`)) return;
        try {
            // For dashboard, use session-based auth instead of API token
            // The Authorization header with Bearer token is for API access
            // For dashboard access, rely on session cookies
            const response = await fetch(`/api/v1/sessions/${sessionId}`, {
                method: 'DELETE',
                // Do not include Authorization header for dashboard UI delete
                // The server will authenticate via session cookies
                headers: { 
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // Handle different response codes
                if (response.status === 401) {
                    alert('Authentication required. Please log in again.');
                    window.location.href = '/admin/login.html';
                    return;
                } else if (response.status === 403) {
                    // Check if it's an ownership issue or general auth issue
                    try {
                        const result = await response.json();
                        if (result.message && result.message.includes('own sessions')) {
                            // This is a user ownership issue - might be an admin who should have access
                            // For admin users, we should bypass ownership check
                            if (Auth.currentUser && Auth.currentUser.role && Auth.currentUser.role === 'admin') {
                                // Admin should be able to delete any session, try with admin flag
                                const adminResponse = await fetch(`/api/v1/sessions/${sessionId}?admin=true`, {
                                    method: 'DELETE',
                                    headers: { 
                                        'Content-Type': 'application/json'
                                    }
                                });
                                if (adminResponse.ok) {
                                    alert('Session deleted successfully!');
                                    const sessionCard = document.getElementById(`session-${sessionId}`);
                                    if (sessionCard) sessionCard.remove();
                                    fetchSessions();
                                    return;
                                }
                            }
                        }
                        alert(result.message || 'You do not have permission to delete this session.');
                    } catch (parseError) {
                        alert('You do not have permission to delete this session.');
                    }
                    return;
                } else if (response.status === 404) {
                    alert('Session not found. It may have already been deleted.');
                    // Remove the session card from UI even if not found on server
                    const sessionCard = document.getElementById(`session-${sessionId}`);
                    if (sessionCard) sessionCard.remove();
                    return;
                }
                
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || `HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            alert(result.message || 'Session deleted successfully!');
            
            // Remove the session card from the UI immediately
            const sessionCard = document.getElementById(`session-${sessionId}`);
            if (sessionCard) {
                sessionCard.remove();
            }
            
            // Refresh session list
            fetchSessions();
        } catch (error) {
            console.error('Error deleting session:', error);
            alert(`An error occurred while deleting the session: ${error.message}`);
            
            // Still refresh the session list to ensure UI is up-to-date
            fetchSessions();
        }
    }

    function initializeWebSocket() {
        fetch('/api/v1/ws-auth')
            .then(res => res.json())
            .then(data => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}?token=${data.wsToken}`);

                ws.onopen = () => { logBox.innerHTML = '<p class="text-success">Log stream connected.</p>'; };
                ws.onmessage = (event) => {
                    const logData = JSON.parse(event.data);
                    if (logData.type === 'log') {
                        const logEntry = document.createElement('div');
                        logEntry.textContent = `[${new Date(logData.timestamp).toLocaleTimeString()}] [${logData.sessionId || 'SYSTEM'}] ${logData.message}`;
                        logBox.appendChild(logEntry);
                        logBox.scrollTop = logBox.scrollHeight;

                        // FIX: If we are waiting for a phone pairing code, check the logs for it.
                        if (currentStep === 5 && logData.message.includes('Your pairing code is:')) {
                            const code = logData.message.split(':').pop().trim();
                            if (code) {
                                modalPairingCodeDisplay.innerHTML = `<strong>${code}</strong>`;
                            }
                        }
                    } else if (logData.type === 'session-update') {
                        updateSessionCards(logData.data);
                    }
                };
                ws.onclose = () => {
                    logBox.innerHTML += '<p class="text-danger">Log stream disconnected. Reconnecting in 5 seconds...</p>';
                    setTimeout(initializeWebSocket, 5000);
                };
                ws.onerror = (error) => { console.error('WebSocket error:', error); ws.close(); };
            })
            .catch(error => {
                console.error('Failed to get WebSocket auth token:', error);
                setTimeout(initializeWebSocket, 5000);
            });
    }

    // Initial load
    fetchSessions();
    initializeWebSocket();
});
