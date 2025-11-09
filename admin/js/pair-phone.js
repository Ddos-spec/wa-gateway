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

    let pollingInterval = null;

    // Function to start polling for pairing status
    function startPolling(sessionId) {
        if (pollingInterval) clearInterval(pollingInterval);

        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/v1/session/${sessionId}/pair-status`);
                if (!response.ok) {
                    clearInterval(pollingInterval);
                    console.error(`Polling failed with status: ${response.status}`);
                    return;
                }

                const data = await response.json();

                if (data.pairingCode) {
                    pairingCodeDisplay.innerHTML = `<strong>${data.pairingCode}</strong>`;
                }

                if (data.sessionStatus === 'CONNECTED') {
                    clearInterval(pollingInterval);
                    pairedPhoneNumber.textContent = data.phoneNumber || 'N/A';
                    pairedSessionId.textContent = sessionId;
                    step2.style.display = 'none';
                    step3.style.display = 'block';
                }

            } catch (error) {
                console.error('Error during polling:', error);
                clearInterval(pollingInterval);
            }
        }, 2000); // Poll every 2 seconds
    }

    // Handle form submission - Step 1
    if (pairingForm) {
        pairingForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const phoneNumber = phoneNumberInput.value.trim();
            if (!phoneNumber) {
                alert('Please enter a phone number');
                return;
            }

            const submitButton = this.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Initiating...';

            try {
                const formattedPhone = phoneNumber.replace(/\D/g, '');
                
                const response = await fetch('/api/v1/session/pair-phone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ phoneNumber: formattedPhone })
                });

                if (response.status === 401) {
                    window.location.href = '/admin/login.html';
                    return;
                }

                if (response.status === 409) {
                    alert('This phone number is already paired or in the process of pairing. Please use a different number or delete the existing session first.');
                    return;
                }

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                step1.style.display = 'none';
                step2.style.display = 'block';
                startPolling(data.sessionId);

            } catch (error) {
                console.error('Error initiating pairing:', error);
                alert('Error initiating pairing: ' + error.message);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Generate Pairing Code';
            }
        });
    }

    // Back to step 1
    if (backToStep1) {
        backToStep1.addEventListener('click', function() {
            if (pollingInterval) clearInterval(pollingInterval);
            step2.style.display = 'none';
            step1.style.display = 'block';
            pairingCodeDisplay.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><span class="ms-2">Waiting for code...</span>`;
        });
    }
});
