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

    // New modal elements
    const modalProgress = document.getElementById('createSessionProgress');
    const qrMethodCard = document.getElementById('qrMethodCard');
    const phoneMethodCard = document.getElementById('phoneMethodCard');

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
            modalNextBtn.innerHTML = '<span class="btn-label">Next</span> <i class="bi bi-arrow-right ms-1"></i>';
            modalNextBtn.style.display = 'block';
            modalNextBtn.disabled = false;
        }
        if(modalBackBtn) modalBackBtn.style.display = 'none';
        if(modalCancelBtn) {
            modalCancelBtn.innerHTML = '<i class="bi bi-x me-1"></i>Cancel';
        }

        // Reset progress bar
        if(modalProgress) {
            modalProgress.style.width = '20%';
            modalProgress.textContent = '20%';
        }
    }

    // Update progress bar based on current step
    function updateProgress() {
        if(!modalProgress) return;

        let width = 0;
        switch(currentStep) {
            case 1: width = 20; break; // Name input
            case 2: width = 40; break; // Method selection
            case 3: width = 70; break; // QR code
            case 4: width = 60; break; // Phone number
            case 5: width = 80; break; // Phone code
            case 6: width = 100; break; // Success
        }

        modalProgress.style.width = width + '%';
        modalProgress.textContent = width + '%';
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
        updateProgress();
        updateModalButtons();
    }

    function updateModalButtons() {
        if(modalBackBtn) modalBackBtn.style.display = 'none';
        if(modalNextBtn) modalNextBtn.style.display = 'block';
        if(modalCancelBtn) modalCancelBtn.style.display = 'block';

        switch (currentStep) {
            case 1: // Name Input
                modalNextBtn.innerHTML = '<span class="btn-label">Next</span> <i class="bi bi-arrow-right ms-1"></i>';
                break;
            case 2: // Method Selection
                modalBackBtn.style.display = 'block';
                modalBackBtn.innerHTML = '<i class="bi bi-arrow-left me-1"></i> Back';
                modalNextBtn.style.display = 'none'; // Selection is done via buttons
                break;
            case 3: // QR Display
            case 5: // Phone Code Display
                modalBackBtn.style.display = 'block';
                modalBackBtn.innerHTML = '<i class="bi bi-arrow-left me-1"></i> Back';
                modalNextBtn.style.display = 'none'; // Auto-progress on success
                break;
            case 4: // Phone Number Input
                modalBackBtn.style.display = 'block';
                modalBackBtn.innerHTML = '<i class="bi bi-arrow-left me-1"></i> Back';
                modalNextBtn.innerHTML = '<i class="bi bi-key me-1"></i> Get Pairing Code';
                break;
            case 6: // Success
                modalBackBtn.style.display = 'none';
                modalNextBtn.style.display = 'none';
                modalCancelBtn.innerHTML = '<i class="bi bi-check2 me-1"></i> Close';
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

    // Add click events for the cards as well
    if(qrMethodCard) qrMethodCard.addEventListener('click', () => showStep(3));
    if(phoneMethodCard) phoneMethodCard.addEventListener('click', () => showStep(4));


    // --- PAIRING LOGIC ---

    async function handleQrPairing() {
        modalQrStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Creating session...';
        console.log('🚀 Starting QR pairing for session:', newSessionId);

        try {
            // 1. Create the session first
            let shouldRegenerateQr = false;

            const createResponse = await fetch('/api/v1/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: newSessionId })
            });

            if (!createResponse.ok) {
                // Check if session already exists
                if(createResponse.status === 409) {
                   console.log('⚠️ Session already exists. Triggering QR regeneration...');
                   shouldRegenerateQr = true;
                } else {
                   const result = await createResponse.json();
                   throw new Error(result.message || 'Failed to create session');
                }
            } else {
                // Update newSessionId with the sanitized sessionId from server
                const createResult = await createResponse.json();
                if (createResult.sessionId) {
                    newSessionId = createResult.sessionId;
                    console.log('✅ Session created with ID:', newSessionId);
                }
            }

            modalQrStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Waiting for QR code...';
            console.log('⏳ Waiting for QR code via WebSocket...');

            // 2. If session existed (409), we MUST force regenerate QR.
            // If session was just created (201), we skip this to avoid race condition.
            if (shouldRegenerateQr) {
                modalQrStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Session exists. Regenerating QR...';
                console.log('📞 Requesting QR for EXISTING session:', newSessionId);
                const qrResponse = await fetch(`/api/v1/sessions/${newSessionId}/qr`);
                if (!qrResponse.ok) {
                     const errData = await qrResponse.json();
                     console.warn('⚠️ QR request failed:', errData);
                     modalQrStatus.textContent = 'Error regenerating QR: ' + (errData.message || 'Unknown error');
                } else {
                     console.log('✅ QR regeneration requested successfully.');
                     modalQrStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Waiting for new QR code...';
                }
            }
            
            // 3. Set timeout to check if QR appeared
            let qrCheckAttempts = 0;
            const maxAttempts = 15; // 15 seconds max wait
            const qrCheckInterval = setInterval(() => {
                qrCheckAttempts++;
                console.log(`⏱️ Checking for QR... (${qrCheckAttempts}/${maxAttempts})`);

                // Check if QR already rendered
                if (modalQrCodeDiv.innerHTML.trim() !== '') {
                    console.log('✅ QR code already rendered!');
                    clearInterval(qrCheckInterval);
                    return;
                }

                if (qrCheckAttempts >= maxAttempts) {
                    console.error('❌ QR code timeout - no QR received after', maxAttempts, 'seconds');
                    modalQrStatus.textContent = 'QR code timeout. Please try again.';
                    clearInterval(qrCheckInterval);
                }
            }, 1000);

        } catch (error) {
            console.error('❌ Error in handleQrPairing:', error);
            modalQrStatus.textContent = `Error: ${error.message}`;
            showNotification('Error creating session: ' + error.message, 'error');
        }
    }

    async function handlePhonePairing() {
        const phoneNumber = modalPhoneNumberInput.value.trim();
        if (!phoneNumber) {
            showNotification('Please enter a phone number', 'warning');
            showStep(4);
            return;
        }

        modalPairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;
        modalNextBtn.disabled = true;
        modalNextBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Processing...';

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
                showNotification('This phone number is already paired or session name taken.', 'error');
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

            // Update UI with loading state
            modalPairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>`;
            modalQrStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Waiting for pairing code...';

            startPhonePairingPolling(activeSessionId);

        } catch (error) {
            console.error('Error initiating pairing:', error);
            showNotification('Error: ' + error.message, 'error');
            showStep(4);
        } finally {
            modalNextBtn.disabled = false;
            modalNextBtn.innerHTML = 'Get Pairing Code';
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
            <div class="card h-100 session-card">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title text-truncate" title="${session.sessionId}">${session.sessionId}</h5>
                        <span class="badge" id="status-${session.sessionId}">...</span>
                    </div>

                    <div id="qr-container-${session.sessionId}" class="text-center my-3" style="min-height: 200px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; border-radius: 8px;">
                        <span class="text-muted small">QR / Preview</span>
                    </div>

                    <div class="d-grid gap-2">
                         <a href="${detailUrl}" class="btn btn-outline-primary btn-sm"><i class="bi bi-eye me-1"></i> Details</a>
                         <button class="btn btn-outline-danger btn-sm" onclick="deleteSession('${session.sessionId}')"><i class="bi bi-trash me-1"></i> Delete</button>
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
                // Check if status has changed to show notification
                const oldStatus = sessionsData.get(session.sessionId)?.status;
                if (oldStatus && oldStatus !== session.status) {
                    if (session.status === 'CONNECTED') {
                        showNotification(`Session ${session.sessionId} is now connected`, 'success');
                    } else if (session.status === 'DISCONNECTED') {
                        showNotification(`Session ${session.sessionId} is disconnected`, 'warning');
                    } else if (oldStatus !== 'CONNECTING' && oldStatus !== 'GENERATING_QR') {
                        showNotification(`Session ${session.sessionId} status changed to ${session.status}`, 'info');
                    }
                }

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
            // Show loading indicator
            const sessionCards = document.querySelectorAll('[id^="session-"]');
            sessionCards.forEach(card => {
                const statusEl = card.querySelector('[id^="status-"]');
                if (statusEl) {
                    const originalContent = statusEl.textContent;
                    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Loading...';
                    statusEl.className = 'badge bg-info';
                }
            });

            const response = await fetch('/api/v1/sessions');
            if (!response.ok) throw new Error('Failed to fetch sessions');
            const sessions = await response.json();
            updateSessionCards(sessions);
        } catch (error) {
            console.error('Error fetching sessions:', error);
            showNotification('Error fetching sessions: ' + error.message, 'error');
        }
    }

    // Delete Confirmation Modal Elements
    const deleteConfirmationModalEl = document.getElementById('deleteConfirmationModal');
    const deleteConfirmationModal = new bootstrap.Modal(deleteConfirmationModalEl);
    const sessionToDeleteName = document.getElementById('sessionToDeleteName');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    let sessionToDelete = null;

    // Initialize delete confirmation modal
    function initDeleteConfirmation() {
        if(confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async function() {
                if (!sessionToDelete) return;

                const sessionData = sessionsData.get(sessionToDelete);
                const token = sessionData ? sessionData.token : null;

                if (!token) {
                    showNotification('Error: Session token not found. Cannot delete.', 'error');
                    return;
                }

                // Disable button and show loading state
                confirmDeleteBtn.disabled = true;
                const originalText = confirmDeleteBtn.innerHTML;
                confirmDeleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Deleting...';

                try {
                    const response = await fetch(`/api/v1/sessions/${sessionToDelete}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    const result = await response.json();

                    if (response.ok) {
                        showNotification('Session deleted successfully', 'success');
                        fetchSessions();
                        deleteConfirmationModal.hide();
                    } else {
                        showNotification(result.message || 'Failed to delete session', 'error');
                    }
                } catch (error) {
                    showNotification(`An error occurred: ${error.message}`, 'error');
                } finally {
                    // Restore button
                    confirmDeleteBtn.disabled = false;
                    confirmDeleteBtn.innerHTML = originalText;
                    sessionToDelete = null;
                }
            });
        }
    }

    window.deleteSession = function(sessionId) {
        sessionToDelete = sessionId;
        sessionToDeleteName.textContent = sessionId;
        deleteConfirmationModal.show();
    }

    // Initialize delete confirmation when DOM is loaded
    initDeleteConfirmation();

    // Function to show toast notifications
    function showNotification(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container');
        const toastId = 'toast-' + Date.now();

        // Determine icon and color based on type
        let icon, bgColor, textColor;
        switch(type) {
            case 'success':
                icon = 'bi-check-circle-fill';
                bgColor = 'bg-success';
                textColor = 'text-white';
                break;
            case 'error':
                icon = 'bi-exclamation-circle-fill';
                bgColor = 'bg-danger';
                textColor = 'text-white';
                break;
            case 'warning':
                icon = 'bi-exclamation-triangle-fill';
                bgColor = 'bg-warning';
                textColor = 'text-dark';
                break;
            default:
                icon = 'bi-info-circle-fill';
                bgColor = 'bg-info';
                textColor = 'text-white';
        }

        const toastHTML = `
            <div id="${toastId}" class="toast fade hide" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="5000">
                <div class="toast-header ${bgColor} ${textColor}">
                    <i class="bi ${icon} me-2"></i>
                    <strong class="me-auto">Notification</strong>
                    <button type="button" class="btn-close ${type === 'warning' ? '' : 'btn-close-white'}" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHTML);

        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl);
        toast.show();

        // Remove toast element after it's hidden
        toastEl.addEventListener('hidden.bs.toast', function() {
            this.remove();
        });
    }

    function initializeWebSocket() {
        // Get WebSocket auth token first
        fetch('/api/v1/ws-auth')
            .then(res => res.json())
            .then(data => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}?token=${data.wsToken}`);

                ws.onopen = () => {
                    logBox.innerHTML = '<p class="text-success small">Log stream connected.</p>';
                    console.log('✅ WebSocket connected with authentication');
                };

                ws.onmessage = (event) => {
                    try {
                        const logData = JSON.parse(event.data);

                        if (logData.type === 'log') {
                            const logEntry = document.createElement('div');
                            logEntry.className = 'small border-bottom border-secondary py-1';
                            logEntry.textContent = `[${new Date(logData.timestamp).toLocaleTimeString()}] [${logData.sessionId || 'SYS'}] ${logData.message}`;
                            logBox.appendChild(logEntry);
                            logBox.scrollTop = logBox.scrollHeight;

                            // Show toast notifications for important log messages
                            if (logData.details && logData.details.event) {
                                if (logData.details.event === 'messages-sent') {
                                    showNotification(`Messages sent to ${logData.details.phoneNumbers?.length || 1} contacts`, 'success');
                                } else if (logData.details.event === 'session-created') {
                                    showNotification(`Session ${logData.details.sessionId} created successfully`, 'success');
                                } else if (logData.details.event === 'session-deleted') {
                                    showNotification(`Session ${logData.details.sessionId} deleted`, 'info');
                                } else if (logData.details.event === 'webhook-updated') {
                                    showNotification(`Webhook updated for session ${logData.details.sessionId}`, 'success');
                                } else if (logData.details.event === 'webhook-deleted') {
                                    showNotification(`Webhook deleted for session ${logData.details.sessionId}`, 'info');
                                } else if (logData.details.event === 'file-uploaded') {
                                    showNotification(`File uploaded: ${logData.details.mediaId}`, 'success');
                                }
                            }
                        }
                        else if (logData.type === 'session-update') {
                            console.log('📡 WebSocket session-update received:', logData.data);

                            // Debug: Check if our session has QR
                            if (currentStep === 3 && newSessionId) {
                                const ourSession = logData.data.find(s => s.sessionId === newSessionId);
                                if (ourSession) {
                                    console.log('🔍 Our session data:', {
                                        sessionId: ourSession.sessionId,
                                        status: ourSession.status,
                                        hasQR: !!ourSession.qr,
                                        qrLength: ourSession.qr ? ourSession.qr.length : 0,
                                        currentStep: currentStep,
                                        newSessionId: newSessionId
                                    });

                                    // Check if session is CONNECTED - auto close modal
                                    if (ourSession.status === 'CONNECTED') {
                                        console.log('🎉 Session CONNECTED! Auto-closing modal...');
                                        modalQrStatus.textContent = 'Connected! Redirecting...';

                                        setTimeout(() => {
                                            createSessionModal.hide();
                                            // Show success toast instead of alert
                                            showNotification(`✅ Session "${ourSession.sessionId}" successfully connected!`, 'success');
                                            // Refresh dashboard to show connected session
                                            fetchSessions();
                                        }, 1500);
                                    }
                                    // FORCE render QR in modal if we're in step 3 and QR exists
                                    else if (ourSession.qr && ourSession.qr.length > 0) {
                                        console.log('✅ FORCE rendering QR in modal NOW');
                                        modalQrCodeDiv.innerHTML = '';
                                        new QRCode(modalQrCodeDiv, { text: ourSession.qr, width: 200, height: 200 });
                                        modalQrStatus.textContent = 'Scan with WhatsApp';
                                    }
                                }
                            }

                            updateSessionCards(logData.data);
                        }
                    } catch(e) {
                        console.error('WS Parse Error', e);
                    }
                };

                ws.onclose = () => {
                    console.log('⚠️ WebSocket disconnected. Reconnecting in 5 seconds...');
                    setTimeout(initializeWebSocket, 5000);
                };

                ws.onerror = (error) => {
                    console.error('❌ WebSocket error:', error);
                    ws.close();
                };
            })
            .catch(error => {
                console.error('❌ Failed to get WebSocket auth token:', error);
                setTimeout(initializeWebSocket, 5000);
            });
    }

    // Initial load
    fetchSessions();
    initializeWebSocket();
});