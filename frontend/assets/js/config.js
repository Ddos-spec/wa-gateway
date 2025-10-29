// API Configuration
const config = {
  // Deteksi base URL secara dinamis
  apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? "http://localhost:5001"
    : `${window.location.protocol}//${window.location.hostname}:5001`,
  backendApiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? "http://localhost:3001"
    : `${window.location.protocol}//${window.location.hostname}:3001`,
  endpoints: {
    login: "/api/auth/login",
    register: "/api/auth/register",
    sessions: "/session",
    verify: "/api/auth/verify",
    messages: "/message",
    sendText: "/message/send-text",
    sendImage: "/message/send-image",
    sendDocument: "/message/send-document",
    webhooks: "/api/webhooks"
  },
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
};

// Backward compatibility for existing scripts
const API_BASE_URL = config.apiUrl;
const API_ENDPOINTS = config.endpoints;

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
  window.location.href = "index.html";
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
