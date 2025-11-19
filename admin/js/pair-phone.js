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

    // Function to connect to WebSocket and handle real-time updates
    async function connectWebSocket(sessionId) {
        if (ws) {
            ws.close();
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
                // 3. Subscribe to pairing updates for the specific session
                ws.send(JSON.stringify({
                    type: 'subscribe_pairing',
                    sessionId: sessionId
                }));
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

                    // Handle pairing in progress (user entering code)
                    if (data.status === 'PAIRING_IN_PROGRESS') {
                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-info';
                            pairingStatusText.innerHTML = '<i class="bi bi-arrow-repeat"></i> Connecting... Please wait.';
                        }
                    }

                    // Handle connecting state
                    if (data.status === 'CONNECTING') {
                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-info';
                            pairingStatusText.innerHTML = '<i class="bi bi-arrow-repeat"></i> Establishing connection...';
                        }
                    }

                    // Handle connection success
                    if (data.status === 'CONNECTED') {
                        // Stop countdown
                        if (countdownInterval) {
                            clearInterval(countdownInterval);
                            countdownInterval = null;
                        }

                        // Show success feedback
                        if (pairingStatus) {
                            pairingStatus.className = 'alert alert-success';
                            pairingStatusText.innerHTML = '<i class="bi bi-check-circle"></i> Successfully connected! Redirecting...';
                        }

                        // Close WebSocket and transition to success screen
                        if (ws) ws.close();

                        setTimeout(() => {
                            pairedPhoneNumber.textContent = data.phoneNumber || 'N/A';
                            pairedSessionId.textContent = sessionId;
                            step2.style.display = 'none';
                            step3.style.display = 'block';
                        }, 1000);
                    }

                    // Handle error or timeout
                    if (data.status === 'ERROR' || data.status === 'TIMEOUT') {
                         // Stop countdown
                         if (countdownInterval) {
                             clearInterval(countdownInterval);
                             countdownInterval = null;
                         }

                         if (ws) ws.close();
                         alert(`Pairing failed: ${data.detail || 'An unknown error occurred.'}`);
                         // Optionally, reset the view
                         step2.style.display = 'none';
                         step1.style.display = 'block';
                    }

                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                alert('A connection error occurred. Please try again.');
            };

            ws.onclose = () => {
                console.log('WebSocket connection closed.');
                ws = null;
            };

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            alert('Could not establish a real-time connection. Please refresh and try again.');
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

            if (!phoneNumber) {
                alert('Please enter a phone number');
                return;
            }

            // Validate session name format
            const sessionNameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
            if (!sessionNameRegex.test(sessionName)) {
                alert('Session name must be 3-30 characters long and contain only letters, numbers, hyphens, or underscores.');
                return;
            }

            const submitButton = this.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Initiating...';
            isSubmitting = true;

            try {
                const formattedPhone = phoneNumber.replace(/\D/g, '');

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

                // Start listening for real-time updates instead of polling
                connectWebSocket(data.sessionId);

            } catch (error) {
                console.error('Error initiating pairing:', error);
                alert('Error initiating pairing: ' + error.message);
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
                    countdownText.textContent = 'Code expired';
                }

                if (pairingStatus) {
                    pairingStatus.className = 'alert alert-danger';
                    pairingStatusText.innerHTML = '<i class="bi bi-x-circle"></i> Code expired. Please try again.';
                }
            }
        }, 1000);
    }

    // Back to step 1
    if (backToStep1) {
        backToStep1.addEventListener('click', function() {
            // Stop countdown
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }

            if (ws) {
                ws.close();
            }

            step2.style.display = 'none';
            step1.style.display = 'block';
            pairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><span class="ms-2">Waiting for code...</span>`;

            // Reset countdown display
            if (countdownTimer) {
                countdownTimer.style.display = 'none';
            }

            // Reset pairing status
            if (pairingStatus) {
                pairingStatus.style.display = 'none';
                pairingStatus.className = 'alert alert-warning';
            }
        });
    }
});
