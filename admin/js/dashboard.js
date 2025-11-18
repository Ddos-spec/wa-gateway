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
        fetch('/api/v1/ws-auth') // This endpoint is fine as it's for getting a token
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

    // Initial load
    fetchSessions();
    initializeWebSocket();
});
