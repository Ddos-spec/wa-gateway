// Establishes a WebSocket connection to the server
const socket = io({
    auth: {
        token: localStorage.getItem('accessToken') // Assuming the JWT is stored in localStorage
    }
});

socket.on('connect', () => {
    console.log('Successfully connected to WebSocket server.');
});

socket.on('connect_error', (err) => {
    console.error('WebSocket connection error:', err.message);
});

socket.on('new_notification', (notification) => {
    console.log('New notification received:', notification);
    updateNotificationUI(notification);
});

// --- UI Update Functions ---

/**
 * Updates the notification count badge and the dropdown list.
 * @param {object} notification - The new notification object.
 */
function updateNotificationUI(notification) {
    const notificationCount = document.getElementById('notificationCount');
    const notificationList = document.getElementById('notificationList');

    // 1. Update the count
    let currentCount = parseInt(notificationCount.textContent || '0', 10);
    notificationCount.textContent = (currentCount + 1).toString();
    notificationCount.classList.remove('d-none'); // Show the badge

    // 2. Add the new notification to the top of the list
    const newNotificationItem = createNotificationItem(notification);

    // Remove the "No new notifications" placeholder if it exists
    const placeholder = notificationList.querySelector('.text-center');
    if (placeholder && placeholder.textContent === 'No new notifications') {
        notificationList.innerHTML = ''; // Clear the list
    }

    notificationList.prepend(newNotificationItem);
}

/**
 * Creates an HTML list item element for a notification.
 * @param {object} notification - The notification object.
 * @returns {HTMLLIElement} The created list item element.
 */
function createNotificationItem(notification) {
    const li = document.createElement('li');
    li.innerHTML = `
        <a class="dropdown-item" href="#" data-id="${notification.id}">
            <div class="d-flex w-100 justify-content-between">
                <h6 class="mb-1">${getNotificationTitle(notification.type)}</h6>
                <small>${new Date(notification.created_at).toLocaleTimeString()}</small>
            </div>
            <p class="mb-1">${notification.message}</p>
        </a>
    `;

    // Add a click listener to mark the notification as read
    li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        markNotificationAsRead(notification.id);
        // Optionally, remove the item from the list or visually mark it as read
        li.classList.add('read');
    });

    return li;
}

/**
 * Provides a user-friendly title based on the notification type.
 * @param {string} type - The notification type from the server.
 * @returns {string} A human-readable title.
 */
function getNotificationTitle(type) {
    switch (type) {
        case 'session_connected':
            return 'Session Connected';
        case 'session_disconnected':
            return 'Session Disconnected';
        case 'new_customer_registered':
            return 'New Customer!';
        default:
            return 'System Alert';
    }
}

/**
 * Fetches all notifications for the user on page load.
 */
async function fetchInitialNotifications() {
    try {
        const response = await fetch(getApiUrl(config.endpoints.notifications), {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Failed to fetch notifications.');

        const notifications = await response.json();
        const notificationList = document.getElementById('notificationList');
        const notificationCount = document.getElementById('notificationCount');

        if (notifications.length === 0) {
            notificationList.innerHTML = '<li><a class="dropdown-item text-center" href="#">No new notifications</a></li>';
            return;
        }

        notificationList.innerHTML = ''; // Clear placeholder
        let unreadCount = 0;

        notifications.forEach(n => {
            const item = createNotificationItem(n);
            if (!n.read_status) {
                unreadCount++;
            } else {
                item.classList.add('read');
            }
            notificationList.appendChild(item);
        });

        if (unreadCount > 0) {
            notificationCount.textContent = unreadCount.toString();
            notificationCount.classList.remove('d-none');
        }

    } catch (error) {
        console.error('Error fetching initial notifications:', error);
    }
}

/**
 * Sends a request to the server to mark a notification as read.
 * @param {number} notificationId - The ID of the notification.
 */
async function markNotificationAsRead(notificationId) {
    try {
        await fetch(getApiUrl(`${config.endpoints.notifications}/${notificationId}/read`), {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        // On success, decrement the counter
        const notificationCount = document.getElementById('notificationCount');
        let currentCount = parseInt(notificationCount.textContent || '0', 10);
        if (currentCount > 0) {
            const newCount = currentCount - 1;
            notificationCount.textContent = newCount.toString();
            if (newCount === 0) {
                notificationCount.classList.add('d-none');
            }
        }
    } catch (error) {
        console.error(`Failed to mark notification ${notificationId} as read:`, error);
    }
}

// Fetch notifications when the page is loaded
document.addEventListener('DOMContentLoaded', fetchInitialNotifications);
