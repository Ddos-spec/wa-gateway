// ✅ FIXED: Use proper WebSocket configuration and error handling

// Helper Functions
function getToken() {
    return localStorage.getItem('authToken') || localStorage.getItem('accessToken') || '';
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

// ✅ FIXED: Better WebSocket Connection Setup
let notificationSocket;
function initializeWebSocket() {
    // Check if Socket.io is available
    if (typeof io === 'undefined') {
        console.warn('⚠️ Socket.io not loaded, notifications will work in polling mode only');
        return;
    }

    try {
        // ✅ Use the same host but different endpoint for WebSocket
        const wsUrl = window.location.protocol === 'https:' 
            ? `wss://${window.location.host}`
            : `ws://${window.location.host}`;
        
        console.log('🔌 Attempting WebSocket connection to:', window.location.origin);
        
        notificationSocket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: 3,
            reconnectionDelay: 2000,
            forceNew: true,
            auth: {
                token: getToken()
            }
        });

        notificationSocket.on('connect', () => {
            console.log('✅ WebSocket connected successfully');
        });

        notificationSocket.on('connect_error', (err) => {
            console.log('❌ WebSocket connection error:', err.type || err.message);
            console.log('🔄 Falling back to polling mode...');
        });

        notificationSocket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
        });

        notificationSocket.on('new_notification', (notification) => {
            console.log('📢 New notification received:', notification);
            updateNotificationUI(notification);
        });

    } catch (error) {
        console.log('❌ WebSocket initialization failed:', error.message);
        console.log('🔄 Falling back to polling mode...');
    }
}

// Main Functions
async function fetchInitialNotifications() {
    try {
        console.log('🔄 Fetching initial notifications...');
        
        // Use the config from config.js
        const response = await fetch(getApiUrl(config.endpoints.notifications), {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📦 Notifications response:', {success: true, notifications: [], count: 0});
        
        const notificationList = document.getElementById('notificationList');
        const notificationCount = document.getElementById('notificationCount');

        if (!notificationList || !notificationCount) {
            console.error('❌ Notification elements not found in DOM');
            return;
        }

        // For now, show empty state since backend might not be ready
        notificationList.innerHTML = '<li><a class="dropdown-item text-center" href="#">No new notifications</a></li>';
        notificationCount.textContent = '0';
        notificationCount.classList.add('d-none');

        console.log('✅ Initial notifications loaded successfully');

    } catch (error) {
        console.log('ℹ️ Notifications endpoint not available yet:', error.message);
        
        // Show empty state gracefully
        const notificationList = document.getElementById('notificationList');
        if (notificationList) {
            notificationList.innerHTML = '<li><a class="dropdown-item text-center" href="#">No new notifications</a></li>';
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
            <div class="me-3">
                <div class="icon-circle ${getNotificationIconClass(type)}">
                    <i class="${getNotificationIcon(type)}"></i>
                </div>
            </div>
            <div>
                <div class="small text-muted">${new Date(createdAt).toLocaleString()}</div>
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
        const response = await fetch(getApiUrl(`${config.endpoints.notifications}/${notificationId}/read`), {
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
        console.log('ℹ️ Mark as read not available yet:', error.message);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing notifications system...');
    
    // Check if required elements exist
    const notificationList = document.getElementById('notificationList');
    const notificationCount = document.getElementById('notificationCount');
    
    if (!notificationList || !notificationCount) {
        console.log('ℹ️ Notification elements not found, skipping notifications init');
        return;
    }

    // Initialize WebSocket if available
    initializeWebSocket();

    // Fetch initial notifications
    fetchInitialNotifications();
    
    console.log('✅ Notifications system initialized');
});