// API Configuration
const config = {
  apiUrl: "https://projek-n8n-wa-gateaway.qk6yxt.easypanel.host",
  endpoints: {
    login: "/auth/login",
    register: "/auth/register",
    sessions: "/session",
    verify: "/auth/verify",
    messages: "/message",
    sendText: "/message/send-text",
    sendImage: "/message/send-image",
    sendDocument: "/message/send-document",
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
