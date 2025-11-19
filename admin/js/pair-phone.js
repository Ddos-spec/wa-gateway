document.addEventListener('auth-success', function() {
    // DOM elements
    const pairingForm = document.getElementById('pairingForm');
    const phoneNumberInput = document.getElementById('phoneNumber');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
    const backToStep1 = document.getElementById('backToStep1');
    const pairedPhoneNumber = document.getElementById('pairedPhoneNumber');
    const pairedSessionId = document.getElementById('pairedSessionId');
    const countdownTimer = document.getElementById('countdownTimer');
    const countdownText = document.getElementById('countdownText');
    const pairingStatus = document.getElementById('pairingStatus');
    const pairingStatusText = document.getElementById('pairingStatusText');

    let ws = null;
    let countdownInterval = null;
    let currentSessionId = null;
    let wsReconnectAttempts = 0;
    let wsReconnectTimer = null;
    const MAX_WS_RECONNECT_ATTEMPTS = 3;

    // Cleanup function to stop everything
    function cleanup() {
        // Stop countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        // Stop reconnect timer
        if (wsReconnectTimer) {
            clearTimeout(wsReconnectTimer);
            wsReconnectTimer = null;
        }

        // Close WebSocket
        if (ws) {
            ws.close();
            ws = null;
        }

        wsReconnectAttempts = 0;
    }

    // Phone number validation and formatting
    function validateAndFormatPhone(phone) {
        // Remove all non-digits
        const cleaned = phone.replace(/\D/g, '');

        // Check if empty
        if (!cleaned) {
            throw new Error('Phone number is required');
        }

        // Check minimum length (Indonesian: 10-13 digits)
        if (cleaned.length < 10 || cleaned.length > 15) {
            throw new Error('Phone number must be 10-15 digits');
        }

        // Check if starts with valid prefix (62 for Indonesia, or other country codes)
        // Allow numbers without country code (will be formatted by backend)
        return cleaned;
    }

    // Function to connect to WebSocket with auto-reconnect
    async function connectWebSocket(sessionId, isReconnect = false) {
        if (!isReconnect) {
            cleanup(); // Clean up old connections
            currentSessionId = sessionId;
        }

        try {
            // 1. Get a one-time WebSocket authentication token
            const authResponse = await fetch('/api/v2/ws-auth');
            if (!authResponse.ok) throw new Error('Failed to get WebSocket token');
            const { wsToken } = await authResponse.json();

            // 2. Establish WebSocket connection
            const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${wsToken}`;
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket connection established.');
                wsReconnectAttempts = 0; // Reset on successful connection

                // 3. Subscribe to pairing updates for the specific session
                ws.send(JSON.stringify({
                    type: 'subscribe_pairing',
                    sessionId: sessionId
                }));

                // If this is a reconnect, show notification
                if (isReconnect && pairingStatus) {
                    pairingStatus.className = 'alert alert-info';
                    pairingStatusText.innerHTML = '<i class="bi bi-arrow-repeat"></i> Reconnected! Waiting for pairing code...';
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Received pairing update:', data);

                    // Update pairing code display
                    if (data.pairingCode) {
                        pairingCodeDisplay.innerHTML = `<strong>${data.pairingCode}</strong>`;

                        // Start countdown timer (30 seconds)
                        startCountdownTimer(30);

                        // Show pairing status
                        if (pairingStatus) {
                            pairingStatus.style.display = 'block';
                            pairingStatus.className = 'alert alert-warning';
                            pairingStatusText.innerHTML = '<i class="bi bi-hourglass-split"></i> Waiting for you to enter the code in WhatsApp...';
                        }
                    }

                    // Handle code entered (connecting state)
                    if (data.status === 'CODE_ENTERED' || data.status === 'CONNECTING') {
                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-info';
                            pairingStatusText.innerHTML = '<i class="bi bi-arrow-repeat"></i> Code entered! Connecting...';
                        }
                    }

                    // Handle restarting (post-pairing restart)
                    if (data.status === 'RESTARTING') {
                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-success';
                            pairingStatusText.innerHTML = '<i class="bi bi-check-circle"></i> Pairing successful! Finalizing connection...';
                        }
                    }

                    // Handle connection success
                    if (data.status === 'CONNECTED') {
                        cleanup(); // Stop everything

                        // Show success feedback
                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-success';
                            pairingStatusText.innerHTML = '<i class="bi bi-check-circle"></i> Successfully connected! Redirecting...';
                        }

                        setTimeout(() => {
                            pairedPhoneNumber.textContent = data.phoneNumber || 'N/A';
                            pairedSessionId.textContent = sessionId;
                            step2.style.display = 'none';
                            step3.style.display = 'block';
                        }, 1000);
                    }

                    // Handle PAIRING_FAILED (Error 428, etc)
                    if (data.status === 'PAIRING_FAILED') {
                        cleanup();

                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-danger';
                            pairingStatusText.innerHTML = `<i class="bi bi-x-circle"></i> Pairing failed: ${data.detail || 'Unknown error'}`;
                        }

                        // Show detailed error message
                        let errorMsg = data.detail || 'An unknown error occurred.';

                        // Better error messages for common errors
                        if (errorMsg.includes('428')) {
                            errorMsg = 'This number is already paired to another device or has reached the maximum number of linked devices. Please:\n\n1. Open WhatsApp on your phone\n2. Go to Settings → Linked Devices\n3. Unlink old devices\n4. Try again';
                        }

                        alert('Pairing Failed:\n\n' + errorMsg);

                        // Return to step 1
                        setTimeout(() => {
                            step2.style.display = 'none';
                            step1.style.display = 'block';
                            resetStep2Display();
                        }, 2000);
                    }

                    // Handle generic ERROR or TIMEOUT
                    if (data.status === 'ERROR' || data.status === 'TIMEOUT') {
                        cleanup();

                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-danger';
                            pairingStatusText.innerHTML = `<i class="bi bi-x-circle"></i> ${data.detail || 'Connection timeout'}`;
                        }

                        alert(`Pairing failed: ${data.detail || 'Connection timeout. Please try again.'}`);

                        // Return to step 1
                        setTimeout(() => {
                            step2.style.display = 'none';
                            step1.style.display = 'block';
                            resetStep2Display();
                        }, 2000);
                    }

                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);

                // Only show alert if not already reconnecting
                if (wsReconnectAttempts === 0 && pairingStatus) {
                    pairingStatus.className = 'alert alert-warning';
                    pairingStatusText.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Connection issue. Retrying...';
                }
            };

            ws.onclose = (event) => {
                console.log('WebSocket connection closed.', event);
                ws = null;

                // Auto-reconnect if we have a session and haven't exceeded max attempts
                if (currentSessionId && wsReconnectAttempts < MAX_WS_RECONNECT_ATTEMPTS && step2.style.display !== 'none') {
                    wsReconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts - 1), 5000); // Exponential backoff: 1s, 2s, 4s

                    console.log(`WebSocket closed. Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts}/${MAX_WS_RECONNECT_ATTEMPTS})...`);

                    if (pairingStatus) {
                        pairingStatus.className = 'alert alert-warning';
                        pairingStatusText.innerHTML = `<i class="bi bi-arrow-repeat"></i> Connection lost. Reconnecting (${wsReconnectAttempts}/${MAX_WS_RECONNECT_ATTEMPTS})...`;
                    }

                    wsReconnectTimer = setTimeout(() => {
                        connectWebSocket(currentSessionId, true);
                    }, delay);
                } else if (wsReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
                    // Max attempts reached
                    console.error('Max WebSocket reconnection attempts reached.');

                    if (pairingStatus) {
                        pairingStatus.className = 'alert alert-danger';
                        pairingStatusText.innerHTML = '<i class="bi bi-x-circle"></i> Connection lost. Please refresh and try again.';
                    }

                    alert('Connection lost. Please refresh the page and try again.');
                }
            };

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);

            if (pairingStatus) {
                pairingStatus.className = 'alert alert-danger';
                pairingStatusText.innerHTML = '<i class="bi bi-x-circle"></i> Could not establish connection.';
            }

            alert('Could not establish a real-time connection. Please refresh and try again.');
        }
    }

    // Reset step 2 display
    function resetStep2Display() {
        pairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><span class="ms-2">Waiting for code...</span>`;

        if (countdownTimer) {
            countdownTimer.style.display = 'none';
        }

        if (pairingStatus) {
            pairingStatus.style.display = 'none';
            pairingStatus.className = 'alert alert-warning';
        }
    }

    // Handle form submission - Step 1
    if (pairingForm) {
        let isSubmitting = false; // Debounce flag

        pairingForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Debounce: prevent double submission
            if (isSubmitting) {
                console.log('Pairing request already in progress, ignoring duplicate');
                return;
            }

            const sessionName = document.getElementById('sessionName').value.trim();
            const phoneNumber = phoneNumberInput.value.trim();

            if (!sessionName) {
                alert('Please enter a session name');
                return;
            }

            // Validate session name format
            const sessionNameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
            if (!sessionNameRegex.test(sessionName)) {
                alert('Session name must be 3-30 characters long and contain only letters, numbers, hyphens, or underscores.');
                return;
            }

            // Validate and format phone number
            let formattedPhone;
            try {
                formattedPhone = validateAndFormatPhone(phoneNumber);
            } catch (error) {
                alert('Invalid phone number: ' + error.message);
                return;
            }

            const submitButton = this.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Initiating...';
            isSubmitting = true;

            try {
                // Use the new, correct API v2 endpoint
                const response = await fetch('/api/v2/pairing/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        phoneNumber: formattedPhone,
                        sessionName: sessionName
                    })
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

                step1.style.display = 'none';
                step2.style.display = 'block';

                // Start listening for real-time updates
                connectWebSocket(data.sessionId);

            } catch (error) {
                console.error('Error initiating pairing:', error);

                let errorMessage = error.message;

                // Better error messages
                if (errorMessage.includes('409')) {
                    errorMessage = 'Session name already exists. Please choose a different name.';
                } else if (errorMessage.includes('Failed to fetch')) {
                    errorMessage = 'Network error. Please check your internet connection and try again.';
                }

                alert('Error initiating pairing: ' + errorMessage);
                isSubmitting = false; // Reset flag on error
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Generate Pairing Code';
            }
        });
    }

    // Function to start countdown timer
    function startCountdownTimer(seconds) {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        let remaining = seconds;

        if (countdownTimer) {
            countdownTimer.style.display = 'block';
        }

        countdownInterval = setInterval(() => {
            remaining--;

            const minutes = Math.floor(remaining / 60);
            const secs = remaining % 60;

            if (countdownText) {
                countdownText.textContent = `Code valid for: ${minutes}:${secs.toString().padStart(2, '0')}`;
            }

            if (remaining <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;

                if (countdownText) {
                    countdownText.textContent = 'Code expired. New code will be generated...';
                }

                if (pairingStatus) {
                    pairingStatus.className = 'alert alert-info';
                    pairingStatusText.innerHTML = '<i class="bi bi-arrow-repeat"></i> Code expired. Generating new code...';
                }
            }
        }, 1000);
    }

    // Back to step 1
    if (backToStep1) {
        backToStep1.addEventListener('click', function() {
            cleanup();

            step2.style.display = 'none';
            step1.style.display = 'block';
            resetStep2Display();

            currentSessionId = null;
        });
    }

    // Cleanup on page unload (prevent orphaned sessions)
    window.addEventListener('beforeunload', function() {
        cleanup();
    });
});
