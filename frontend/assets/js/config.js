// API Configuration
const config = {
  // ✅ Single base URL
  apiUrl: window.location.hostname === 'localhost' 
    ? "http://localhost:3001"
    : `${window.location.protocol}//${window.location.host}/api`,
    
  endpoints: {
    // ✅ Consistent /api/ prefix untuk semua backend calls
    login: "/auth/login",           // Backend will add /api/ prefix
    sessions: "/sessions",           // → /api/sessions
    sessionStart: "/sessions/start", // Backend proxies to gateway
    messages: "/messages",
    webhooks: "/webhooks",
    notifications: "/notifications"
  }
};

// ✅ Helper function
function getApiUrl(endpoint) {
  return `${config.apiUrl}${endpoint}`;
}

function getToken() {
  return localStorage.getItem("authToken") ?? localStorage.getItem("token");
}

function saveToken(token) {
  localStorage.setItem("authToken", token);
  localStorage.removeItem("token");
}

function clearToken() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("token");
}

function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function showToast(type, message) {
  const toastId = type === "success" ? "successToast" : "errorToast";
  const messageId = type === "success" ? "successMessage" : "errorMessage";

  const messageElement = document.getElementById(messageId);
  if (messageElement) {
    messageElement.textContent = message;
  }

  const toastElement = document.getElementById(toastId);
  if (toastElement) {
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
  }
}

function logout() {
  clearToken();
  localStorage.removeItem("username");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userType");
  window.location.href = "customer_login.html";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    config,
    getToken,
    saveToken,
    clearToken,
    checkAuth,
    showToast,
    logout,
  };
}
