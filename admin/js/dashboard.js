// admin/js/dashboard.js

document.addEventListener('auth-success', function() {
    // This code runs only after the user is successfully authenticated.
    
    const sessionsContainer = document.getElementById('sessions-container');
    const createSessionBtn = document.getElementById('createSessionBtn');
    const sessionIdInput = document.getElementById('sessionIdInput');
    const logBox = document.getElementById('log-box');
    
    const sessionsData = new Map(); // Store full session data including token

    // API Control Elements
    const apiSessionIdSelect = document.getElementById('api-session-id');
    const apiRecipientInput = document.getElementById('api-recipient');
    const apiUsageExample = document.getElementById('api-usage-example');
    const apiResponseDiv = document.getElementById('api-response');
    const imageUploadInput = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');

    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'col-md-6 mb-4';
        card.id = `session-${session.sessionId}`;
        
        const ownerInfo = session.owner ? `<small class="text-muted d-block mb-2">Owner: ${Auth.currentUser.email}</small>` : '';
        
        const canDelete = Auth.currentUser.role === 'admin' || session.owner === Auth.currentUser.email;
        const deleteButton = canDelete ? 
            `<button class="btn btn-sm btn-outline-danger" onclick="deleteSession('${session.sessionId}')">Delete</button>` : 
            '';
        
        const detailButton = `<a href="/admin/detailsesi.html?sessionId=${session.sessionId}" class="btn btn-sm btn-outline-primary">Detail</a>`;

        card.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title mb-3">
                        <span>Session: <strong>${session.sessionId}</strong></span>
                    </h5>
                    ${ownerInfo}
                    <span class="badge status-badge mb-3" id="status-${session.sessionId}"></span>
                    <div class="d-flex justify-content-end gap-2 mt-3">
                        ${detailButton}
                        ${deleteButton}
                    </div>
                </div>
            </div>
        `;
        return card;
    }

    function updateSessionCards(sessions) {
        sessions.forEach(s => sessionsData.set(s.sessionId, s));
        
        const existingCardIds = Array.from(sessionsContainer.children).map(c => c.id);
        const fetchedSessionIds = sessions.map(s => `session-${s.sessionId}`);
        existingCardIds.forEach(cardId => {
            if (!fetchedSessionIds.includes(cardId)) {
                document.getElementById(cardId)?.remove();
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

            statusEl.textContent = `${session.status}${session.detail ? ' - ' + session.detail : ''}`;
            statusEl.className = 'badge status-badge ';
            if (session.status === 'CONNECTED') {
                statusEl.classList.add('bg-success');
            } else if (session.status === 'DISCONNECTED') {
                statusEl.classList.add('bg-danger');
            } else {
                statusEl.classList.add('bg-warning', 'text-dark');
            }
        });
    }

    async function fetchSessions() {
        try {
            const response = await fetch('/api/v1/sessions');
            if (!response.ok) throw new Error('Failed to fetch sessions');
            const sessions = await response.json();
            updateSessionCards(sessions);
            updateApiSessionSelect(sessions);
        } catch (error) {
            console.error('Error fetching sessions:', error);
        }
    }

    window.getQrCode = async function(sessionId) {
        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}/qr`, { credentials: 'same-origin' });
            const result = await response.json();
            if (!response.ok && result.message && !result.message.includes('token')) {
                alert('Failed to get QR code: ' + (result.message || result.error));
            }
        } catch (error) {
            console.error('Error getting QR code:', error);
        }
    }

    window.deleteSession = async function(sessionId) {
        if (!confirm(`Are you sure you want to delete session ${sessionId}?`)) return;

        const token = sessionsData.get(sessionId)?.token;
         if (!token) {
            alert('Could not find token for this session. Cannot delete.');
            return;
        }

        try {
            const response = await fetch(`/api/v1/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (response.ok) {
                alert(result.message);
                fetchSessions();
            } else {
                throw new Error(result.message || 'Failed to delete session');
            }
        } catch (error) {
            alert(`An error occurred while deleting the session: ${error.message}`);
        }
    }

    function initializeWebSocket() {
        fetch('/api/v1/ws-auth')
            .then(res => res.json())
            .then(data => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}?token=${data.wsToken}`);

                ws.onopen = () => {
                    logBox.innerHTML = '<p class="text-success">Log stream connected.</p>';
                };

                ws.onmessage = (event) => {
                    const logData = JSON.parse(event.data);
                    if(logData.type === 'log') {
                        const logEntry = document.createElement('div');
                        logEntry.textContent = `[${new Date(logData.timestamp).toLocaleTimeString()}] [${logData.sessionId || 'SYSTEM'}] ${logData.message}`;
                        logBox.appendChild(logEntry);
                        logBox.scrollTop = logBox.scrollHeight;
                    } else if (logData.type === 'session-update') {
                        updateSessionCards(logData.data);
                        updateApiSessionSelect(logData.data);
                    }
                };

                ws.onclose = () => {
                    logBox.innerHTML += '<p class="text-danger">Log stream disconnected. Reconnecting in 5 seconds...</p>';
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
    
    function updateApiSessionSelect(sessions) {
        const currentVal = apiSessionIdSelect.value;
        apiSessionIdSelect.innerHTML = '';
        sessions.forEach(session => {
            if (session.status === 'CONNECTED') {
                const option = document.createElement('option');
                option.value = session.sessionId;
                option.textContent = session.sessionId;
                apiSessionIdSelect.appendChild(option);
            }
        });
        if (Array.from(apiSessionIdSelect.options).some(opt => opt.value === currentVal)) {
            apiSessionIdSelect.value = currentVal;
        }
        updateApiUsage();
    }

    window.copyToClipboard = function(inputId, btn) {
        const input = document.getElementById(inputId);
        input.select();
        input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).then(() => {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-clipboard-check"></i>';
            setTimeout(() => { btn.innerHTML = original; }, 1200);
        });
    }

    // Initial load
    fetchSessions();
    initializeWebSocket();

    // Event Listeners
    createSessionBtn.addEventListener('click', async () => {
        const sessionId = sessionIdInput.value.trim().replace(/\s+/g, '_');
        if (!sessionId) {
            alert('Please enter a Session ID.');
            return;
        }
        
        try {
            const response = await fetch('/api/v1/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ sessionId })
            });
            const result = await response.json();
            if (response.ok) {
                sessionIdInput.value = '';
                setTimeout(fetchSessions, 1000);
            } else {
                throw new Error(result.message || 'Failed to create session');
            }
        } catch (error) {
            alert(`An error occurred: ${error.message}`);
        }
    });
});
