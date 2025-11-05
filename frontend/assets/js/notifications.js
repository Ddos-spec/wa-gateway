// Configuration
const config = {
    endpoints: {
        notifications: '/api/notifications'
    }
};

// Helper Functions
function getApiUrl(endpoint) {
    return `${window.location.origin}${endpoint}`;
}

function getToken() {
    return localStorage.getItem('accessToken') || '';
}

function getNotificationTitle(type) {
    switch (type) {
        case 'session_connected':
        case 'connected': 
            return 'WhatsApp Connected';
        case 'session_disconnected':
        case 'disconnected': 
            return 'WhatsApp Disconnected';
        case 'new_customer_registered':
        case 'customer':
            return 'New Customer';
        case 'message':
            return 'New Message';
        case 'error':
            return 'System Error';
        default:
            return 'Notification';
    }
}

function getNotificationIcon(type) {
    switch (type) {
        case 'session_connected':
        case 'connected': 
            return 'fas fa-plug';
        case 'session_disconnected':
        case 'disconnected': 
            return 'fas fa-unlink';
        case 'new_customer_registered':
        case 'customer':
            return 'fas fa-user-plus';
        case 'message':
            return 'fas fa-comment';
        case 'error':
            return 'fas fa-exclamation-triangle';
        default:
            return 'fas fa-bell';
    }
}

function getNotificationIconClass(type) {
    switch (type) {
        case 'session_connected':
        case 'connected': 
            return 'bg-success';
        case 'session_disconnected':
        case 'disconnected': 
            return 'bg-danger';
        case 'new_customer_registered':
        case 'customer':
            return 'bg-primary';
        case 'error':
            return 'bg-warning';
        default:
            return 'bg-info';
    }
}

// WebSocket Connection Setup
let socket;
function initializeWebSocket() {
    try {
        socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            auth: {
                token: getToken()
            }
        });

        socket.on('connect', () => {
            console.log('✅ Successfully connected to WebSocket server.');
        });

        socket.on('connect_error', (err) => {
            console.error('❌ WebSocket connection error:', err.message);
            console.log('🔄 Falling back to polling mode...');
        });

        socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
        });

        socket.on('new_notification', (notification) => {
            console.log('📢 New notification received:', notification);
            updateNotificationUI(notification);
        });

    } catch (error) {
        console.error('❌ Failed to initialize WebSocket:', error);
    }
}

// Main Functions
async function fetchInitialNotifications() {
    try {
        console.log('🔄 Fetching initial notifications...');
        
        const response = await fetch(getApiUrl(config.endpoints.notifications), {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to fetch notifications`);
        }

        const result = await response.json();
        console.log('📦 Notifications response:', result);
        
        // Handle different response formats
        let notifications;
        if (result.success && Array.isArray(result.notifications)) {
            notifications = result.notifications;
        } else if (Array.isArray(result)) {
            notifications = result;
        } else if (result.success && Array.isArray(result.data)) {
            notifications = result.data;
        } else {
            console.warn('⚠️ Unexpected notifications format:', result);
            notifications = [];
        }

        const notificationList = document.getElementById('notificationList');
        const notificationCount = document.getElementById('notificationCount');

        if (!notificationList || !notificationCount) {
            console.error('❌ Notification elements not found in DOM');
            return;
        }

        if (notifications.length === 0) {
            notificationList.innerHTML = '<li class="text-center py-2">No new notifications</li>';
            notificationCount.textContent = '0';
            notificationCount.classList.add('d-none');
        } else {
            // Clear existing content
            notificationList.innerHTML = '';
            
            // Process each notification safely
            notifications.forEach(notification => {
                try {
                    const notificationItem = createNotificationItem(notification);
                    notificationList.appendChild(notificationItem);
                } catch (itemError) {
                    console.error('❌ Error creating notification item:', itemError, notification);
                }
            });

            // Update count
            notificationCount.textContent = notifications.length.toString();
            notificationCount.classList.remove('d-none');
        }

        console.log('✅ Initial notifications loaded successfully');

    } catch (error) {
        console.error('❌ Error fetching initial notifications:', error);
        
        // Show user-friendly error in UI
        const notificationList = document.getElementById('notificationList');
        if (notificationList) {
            notificationList.innerHTML = `
                <li class="text-center py-2 text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Unable to load notifications
                    <br><small>${error.message}</small>
                </li>
            `;
        }
    }
}

function createNotificationItem(notification) {
    const li = document.createElement('li');
    li.className = 'notification-item';
    
    // Handle missing properties safely
    const message = notification.message || notification.details || notification.action || 'New notification';
    const type = notification.type || notification.action || 'system';
    const createdAt = notification.created_at || notification.timestamp || new Date();
    const id = notification.id || Date.now();

    // Format message if it's JSON
    let displayMessage = message;
    if (typeof message === 'object') {
        displayMessage = JSON.stringify(message);
    }

    li.innerHTML = `
        <a href="#" class="dropdown-item d-flex align-items-center notification-link" data-id="${id}">
            <div class="mr-3">
                <div class="icon-circle ${getNotificationIconClass(type)}">
                    <i class="${getNotificationIcon(type)}"></i>
                </div>
            </div>
            <div>
                <div class="small text-gray-500">${new Date(createdAt).toLocaleString()}</div>
                <strong>${getNotificationTitle(type)}</strong>
                <div class="small">${displayMessage}</div>
            </div>
        </a>
    `;

    // Add click listener with error handling
    const link = li.querySelector('.notification-link');
    if (link) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                markNotificationAsRead(id);
                li.classList.add('read');
            } catch (error) {
                console.error('❌ Error marking notification as read:', error);
            }
        });
    }

    return li;
}

function updateNotificationUI(notification) {
    try {
        const notificationCount = document.getElementById('notificationCount');
        const notificationList = document.getElementById('notificationList');

        if (!notificationCount || !notificationList) {
            console.error('❌ Notification UI elements not found');
            return;
        }

        // Update count
        let currentCount = parseInt(notificationCount.textContent || '0', 10);
        currentCount += 1;
        notificationCount.textContent = currentCount.toString();
        notificationCount.classList.remove('d-none');

        // Remove "no notifications" message if exists
        const noNotificationsMsg = notificationList.querySelector('.text-center');
        if (noNotificationsMsg && noNotificationsMsg.textContent.includes('No new notifications')) {
            noNotificationsMsg.remove();
        }

        // Add new notification to the top of the list
        const newNotificationItem = createNotificationItem(notification);
        notificationList.insertBefore(newNotificationItem, notificationList.firstChild);

        // Limit to maximum 20 notifications displayed
        const items = notificationList.querySelectorAll('.notification-item');
        if (items.length > 20) {
            items[items.length - 1].remove();
        }

        console.log('✅ Notification UI updated successfully');

    } catch (error) {
        console.error('❌ Error updating notification UI:', error);
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        const response = await fetch(`${getApiUrl('/api/notifications')}/${notificationId}/read`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('⚠️ Failed to mark notification as read:', response.status);
        }
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing notifications system...');
    
    // Check if required elements exist
    const notificationList = document.getElementById('notificationList');
    const notificationCount = document.getElementById('notificationCount');
    
    if (!notificationList || !notificationCount) {
        console.error('❌ Required notification elements not found in DOM');
        console.log('Expected elements: #notificationList, #notificationCount');
        return;
    }

    // Initialize WebSocket if available
    if (typeof io !== 'undefined') {
        initializeWebSocket();
    } else {
        console.warn('⚠️ Socket.io not loaded, notifications will work in polling mode only');
    }

    // Fetch initial notifications
    fetchInitialNotifications();
    
    console.log('✅ Notifications system initialized');
});

// Graceful degradation if Socket.io fails
window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('io is not defined')) {
        console.warn('⚠️ Socket.io not loaded, notifications will work in polling mode only');
    }
});


// GET /api/notifications/recent - Get recent notifications (last 24 hours)
router.get('/recent', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                sl.id,
                sl.action,
                sl.details,
                sl.timestamp,
                s.session_name,
                s.status
            FROM session_logs sl
            LEFT JOIN sessions s ON sl.session_id = s.id
            WHERE sl.timestamp >= NOW() - INTERVAL '24 hours'
            ORDER BY sl.timestamp DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            notifications: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('❌ Error fetching recent notifications:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch recent notifications' 
        });
    }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        
        // For now, just return success (you can implement actual read status later)
        console.log(`📖 Marking notification ${notificationId} as read`);
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark notification as read' 
        });
    }
});

// POST /api/notifications - Create new notification (for testing)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { action, details, session_id } = req.body;

        const result = await pool.query(`
            INSERT INTO session_logs (action, details, session_id, timestamp)
            VALUES ($1, $2, $3, NOW())
            RETURNING *
        `, [action, details, session_id || null]);

        console.log('📝 Created new notification:', result.rows[0]);

        // Emit to WebSocket if available
        const io = req.app.get('io');
        if (io) {
            io.to('notifications').emit('new_notification', result.rows[0]);
        }

        res.json({
            success: true,
            notification: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error creating notification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create notification' 
        });
    }
});

