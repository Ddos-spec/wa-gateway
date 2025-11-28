// admin/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() { // Using DOMContentLoaded as auth-check might be bypassed/modified
    // --- EXISTING DASHBOARD ELEMENTS ---
    const sessionsContainer = document.getElementById('sessions-container');
    const logBox = document.getElementById('log-box');
    const sessionsData = new Map();

    // --- NEW MODAL ELEMENTS ---
    const createSessionModalEl = document.getElementById('createSessionModal');
    const createSessionModal = new bootstrap.Modal(createSessionModalEl);
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

    // Reset function when modal is closed
    function resetModal() {
        currentStep = 1;
        newSessionId = '';
        if (phonePairingPollInterval) clearInterval(phonePairingPollInterval);

        // Reset all steps to hidden
        [modalStep1, modalStep2, modalStepQr, modalStepPhoneNumber, modalStepPhoneCode, modalStepSuccess].forEach(step => {
            if(step) step.style.display = 'none';
        });
        if(modalStep1) modalStep1.style.display = 'block';

        // Reset inputs
        if(newSessionIdInput) newSessionIdInput.value = '';
        if(modalPhoneNumberInput) modalPhoneNumberInput.value = '';
        if(modalQrCodeDiv) modalQrCodeDiv.innerHTML = '';
        if(modalQrStatus) modalQrStatus.textContent = 'Initializing...';
        if(modalPairingCodeDisplay) modalPairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;

        // Reset buttons
        if(modalNextBtn) {
            modalNextBtn.textContent = 'Next';
            modalNextBtn.style.display = 'block';
            modalNextBtn.disabled = false;
        }
        if(modalBackBtn) modalBackBtn.style.display = 'none';
        if(modalCancelBtn) {
            modalCancelBtn.style.display = 'block';
            modalCancelBtn.textContent = 'Cancel';
        }
    }

    // Navigation handler
    function showStep(stepNumber) {
        [modalStep1, modalStep2, modalStepQr, modalStepPhoneNumber, modalStepPhoneCode, modalStepSuccess].forEach(step => {
            if(step) step.style.display = 'none';
        });
        
        let currentModalStep;
        switch (stepNumber) {
            case 1: currentModalStep = modalStep1; break;
            case 2: currentModalStep = modalStep2; break;
            case 3: // QR
                currentModalStep = modalStepQr;
                handleQrPairing(); // Start QR flow
                break;
            case 4: // Phone Number Input
                currentModalStep = modalStepPhoneNumber;
                break;
            case 5: // Phone Code Display
                currentModalStep = modalStepPhoneCode;
                handlePhonePairing(); // Start Phone flow
                break;
            case 6: // Success
                currentModalStep = modalStepSuccess;
                break;
        }
        if(currentModalStep) currentModalStep.style.display = 'block';
        currentStep = stepNumber;
        updateModalButtons();
    }

    function updateModalButtons() {
        if(modalBackBtn) modalBackBtn.style.display = 'none';
        if(modalNextBtn) modalNextBtn.style.display = 'block';
        if(modalCancelBtn) modalCancelBtn.style.display = 'block';

        switch (currentStep) {
            case 1: // Name Input
                modalNextBtn.textContent = 'Next';
                break;
            case 2: // Method Selection
                modalBackBtn.style.display = 'block';
                modalNextBtn.style.display = 'none'; // Selection is done via buttons
                break;
            case 3: // QR Display
            case 5: // Phone Code Display
                modalBackBtn.style.display = 'block';
                modalNextBtn.style.display = 'none'; // Auto-progress on success
                break;
            case 4: // Phone Number Input
                modalBackBtn.style.display = 'block';
                modalNextBtn.textContent = 'Get Pairing Code';
                break;
            case 6: // Success
                modalBackBtn.style.display = 'none';
                modalNextBtn.style.display = 'none';
                modalCancelBtn.textContent = 'Finish'; // Acts as Close
                break;
        }
    }

    // --- EVENT LISTENERS ---

    if(modalNextBtn) {
        modalNextBtn.addEventListener('click', () => {
            if (currentStep === 1) {
                const rawId = newSessionIdInput.value.trim();
                // Validation: only alphanumeric and hyphen
                if (!/^[a-zA-Z0-9-]+$/.test(rawId)) {
                    alert('Session name can only contain letters, numbers, and hyphens.');
                    return;
                }
                newSessionId = rawId;
                modalSessionName.textContent = newSessionId;
                showStep(2);
            } else if (currentStep === 4) {
                showStep(5); // Trigger phone pairing logic
            }
        });
    }

    if(modalBackBtn) {
        modalBackBtn.addEventListener('click', () => {
            if (phonePairingPollInterval) clearInterval(phonePairingPollInterval);
            
            if (currentStep === 3 || currentStep === 4) {
                showStep(2); // Back to method selection
            } else if (currentStep === 2) {
                showStep(1); // Back to name input
            } else if (currentStep === 5) {
                showStep(4); // Back to phone number input
            }
        });
    }

    if(createSessionModalEl) {
        createSessionModalEl.addEventListener('hidden.bs.modal', resetModal);
    }
    
    if(modalPairQrBtn) modalPairQrBtn.addEventListener('click', () => showStep(3));
    if(modalPairPhoneBtn) modalPairPhoneBtn.addEventListener('click', () => showStep(4));


    // --- PAIRING LOGIC ---

    async function handleQrPairing() {
        modalQrStatus.textContent = 'Creating session...';
        try {
            // 1. Create the session first
            // Note: We assume auth is bypassed or handled globally, passing dummy token if needed
            const createResponse = await fetch('/api/v1/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: newSessionId })
            });

            if (!createResponse.ok) {
                // Check if session already exists
                if(createResponse.status === 409) {
                   // If exists, just try to get QR.
                   console.log('Session exists, fetching QR...');
                } else {
                   const result = await createResponse.json();
                   throw new Error(result.message || 'Failed to create session');
                }
            } else {
                // Update newSessionId with the sanitized sessionId from server
                const createResult = await createResponse.json();
                if (createResult.sessionId) {
                    newSessionId = createResult.sessionId;
                    console.log('Session created with ID:', newSessionId);
                }
            }

            modalQrStatus.textContent = 'Fetching QR code...';

            // 2. Get the QR code immediately
            const qrResponse = await fetch(`/api/v1/sessions/${newSessionId}/qr`);
            const qrResult = await qrResponse.json();

            if (!qrResponse.ok) {
                 // If QR not ready, websocket will handle it.
                 console.warn('QR not immediately available:', qrResult);
            } else if(qrResult.qr) {
                 // Render QR if available immediately
                 if(currentStep === 3) {
                     modalQrCodeDiv.innerHTML = '';
                     new QRCode(modalQrCodeDiv, { text: qrResult.qr, width: 200, height: 200 });
                     modalQrStatus.textContent = 'Scan with WhatsApp';
                 }
            }

            modalQrStatus.textContent = 'Waiting for QR code stream...';
            
        } catch (error) {
            modalQrStatus.textContent = `Error: ${error.message}`;
        }
    }

    async function handlePhonePairing() {
        const phoneNumber = modalPhoneNumberInput.value.trim();
        if (!phoneNumber) {
            alert('Please enter a phone number');
            showStep(4);
            return;
        }

        modalPairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;
        
        try {
            // 1. Create session if it doesn't exist (Phone pairing endpoint might expect session to exist)
            // But api/v1/session/pair-phone usually handles creation or expects existing.
            // Let's look at previous pair-phone.js logic. It posts to /api/v1/session/pair-phone with phoneNumber.
            // It does NOT send sessionId. The server generates a random ID or handles it?
            // WAIT: The user entered a Custom Session ID in Step 1. We MUST use it.
            
            // IMPORTANT: The original pair-phone.js did NOT allow custom session IDs. 
            // It relied on the server creating a session.
            // We need to ensure we pass our 'newSessionId' to the server.
            
            const formattedPhone = phoneNumber.replace(/\D/g, '');
            
            const response = await fetch('/api/v1/session/pair-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phoneNumber: formattedPhone,
                    sessionId: newSessionId // We pass the custom ID here
                })
            });

            if (response.status === 409) {
                alert('This phone number is already paired or session name taken.');
                showStep(4);
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            // The server might return a different sessionId if it generated one, but we sent ours.
            // Let's use what the server returns to be safe.
            const activeSessionId = data.sessionId || newSessionId;
            
            startPhonePairingPolling(activeSessionId);

        } catch (error) {
            console.error('Error initiating pairing:', error);
            alert('Error: ' + error.message);
            showStep(4);
        }
    }

    function startPhonePairingPolling(sessionId) {
        if (phonePairingPollInterval) clearInterval(phonePairingPollInterval);

        phonePairingPollInterval = setInterval(async () => {
            try {
                // Check status
                const response = await fetch(`/api/v1/session/${sessionId}/pair-status`);
                if (!response.ok) {
                    // If 404, maybe session died?
                    return;
                }
                const data = await response.json();

                // Update Code Display
                if (data.pairingCode && currentStep === 5) {
                     // Format code nicely (ABCD-1234)
                     const code = data.pairingCode;
                     const formatted = code.includes('-') ? code : code.match(/.{1,4}/g).join('-');
                     modalPairingCodeDisplay.innerHTML = formatted;
                }

                // Check Connection
                if (data.sessionStatus === 'CONNECTED') {
                    clearInterval(phonePairingPollInterval);
                    successSessionId.textContent = sessionId;
                    showStep(6);
                    fetchSessions(); // Refresh list
                }
            } catch (error) {
                console.error('Error during polling:', error);
            }
        }, 2000);
    }

    // --- EXISTING DASHBOARD LOGIC ---

    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4 mb-4'; // Responsive grid
        card.id = `session-${session.sessionId}`;
        
        // Detail link
        const detailUrl = `/admin/detailsesi.html?sessionId=${session.sessionId}`;
        
        card.innerHTML = `
            <div class="card h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title text-truncate" title="${session.sessionId}">${session.sessionId}</h5>
                        <span class="badge" id="status-${session.sessionId}">...</span>
                    </div>
                    
                    <div id="qr-container-${session.sessionId}" class="text-center my-3" style="min-height: 200px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; border-radius: 8px;">
                        <span class="text-muted small">QR / Preview</span>
                    </div>

                    <div class="d-grid gap-2">
                         <a href="${detailUrl}" class="btn btn-outline-primary btn-sm"><i class="bi bi-eye"></i> Details</a>
                         <button class="btn btn-outline-danger btn-sm" onclick="deleteSession('${session.sessionId}')"><i class="bi bi-trash"></i> Delete</button>
                    </div>
                </div>
            </div>`;
        return card;
    }

    function updateSessionCards(sessions) {
        sessions.forEach(s => sessionsData.set(s.sessionId, s));
        
        // Cleanup removed sessions
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
            if (statusEl) {
                statusEl.textContent = session.status;
                statusEl.className = 'badge ';
                if (session.status === 'CONNECTED') statusEl.classList.add('bg-success');
                else if (session.status === 'DISCONNECTED') statusEl.classList.add('bg-danger');
                else statusEl.classList.add('bg-warning', 'text-dark');
            }

            // QR Logic for Dashboard Cards
            // We only show QR in dashboard card if it's NOT connected and NOT currently being handled in the modal
            const qrContainer = document.getElementById(`qr-container-${session.sessionId}`);
            const modalQrContainer = document.getElementById('modal-qr-code');

            // If this session is currently active in the modal (Step 3), update the modal QR instead
            if (currentStep === 3 && newSessionId === session.sessionId && session.qr) {
                console.log('✅ Rendering QR in MODAL for session:', session.sessionId);
                console.log('   - currentStep:', currentStep);
                console.log('   - newSessionId:', newSessionId);
                console.log('   - session.sessionId:', session.sessionId);
                console.log('   - QR length:', session.qr.length);
                modalQrCodeDiv.innerHTML = '';
                new QRCode(modalQrCodeDiv, { text: session.qr, width: 200, height: 200 });
                modalQrStatus.textContent = 'Scan with WhatsApp';
            } 
            // Otherwise update the dashboard card QR
            else if (qrContainer) {
                if (session.status !== 'CONNECTED' && session.qr) {
                    console.log('⚠️ Rendering QR in DASHBOARD CARD (not modal) for session:', session.sessionId);
                    console.log('   - currentStep:', currentStep, '(expected: 3)');
                    console.log('   - newSessionId:', newSessionId);
                    console.log('   - session.sessionId:', session.sessionId);
                    console.log('   - Match?', newSessionId === session.sessionId);
                    qrContainer.innerHTML = '';
                    new QRCode(qrContainer, { text: session.qr, width: 150, height: 150 });
                } else if (session.status === 'CONNECTED') {
                    qrContainer.innerHTML = '<i class="bi bi-whatsapp text-success" style="font-size: 3rem;"></i><p class="small text-muted mt-2">Connected</p>';
                } else {
                     qrContainer.innerHTML = '<div class="spinner-border text-secondary" role="status"></div>';
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
            const response = await fetch(`/api/v1/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (response.ok) {
                fetchSessions();
            } else {
                alert(result.message || 'Failed to delete session');
            }
        } catch (error) {
            alert(`An error occurred: ${error.message}`);
        }
    }

    function initializeWebSocket() {
        // Just try to connect without auth first, since we removed auth
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => { logBox.innerHTML = '<p class="text-success small">Log stream connected.</p>'; };
        ws.onmessage = (event) => {
            try {
                const logData = JSON.parse(event.data);
                
                if (logData.type === 'log') {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'small border-bottom border-secondary py-1';
                    logEntry.textContent = `[${new Date(logData.timestamp).toLocaleTimeString()}] [${logData.sessionId || 'SYS'}] ${logData.message}`;
                    logBox.appendChild(logEntry);
                    logBox.scrollTop = logBox.scrollHeight;
                } 
                else if (logData.type === 'session-update') {
                    updateSessionCards(logData.data);
                }
            } catch(e) { console.error('WS Parse Error', e); }
        };
        ws.onclose = () => {
            setTimeout(initializeWebSocket, 5000);
        };
        ws.onerror = (error) => { console.error('WebSocket error:', error); ws.close(); };
    }

    // Initial load
    fetchSessions();
    initializeWebSocket();
});