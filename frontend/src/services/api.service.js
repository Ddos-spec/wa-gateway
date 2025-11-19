import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const API_KEY = process.env.REACT_APP_API_KEY || '';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
  },
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
    console.error('API Error:', errorMessage);
    return Promise.reject(error);
  }
);

const apiService = {
  startPairingSession: async (sessionId, phoneNumber, webhookUrl = null) => {
    const response = await axiosInstance.post('/api/pairing/start/' + sessionId, {
      phoneNumber,
      webhookUrl,
    });
    return response.data;
  },

  getPairingStatus: async (sessionId) => {
    const response = await axiosInstance.get('/api/pairing/status/' + sessionId);
    return response.data;
  },

  sendMessage: async (sessionId, to, message) => {
    const response = await axiosInstance.post('/api/pairing/send/' + sessionId, {
      to,
      message,
    });
    return response.data;
  },

  sendBulkMessages: async (sessionId, recipients, message, delay = 1000) => {
    const response = await axiosInstance.post('/api/pairing/send-bulk/' + sessionId, {
      recipients,
      message,
      delay,
    });
    return response.data;
  },

  deleteSession: async (sessionId) => {
    const response = await axiosInstance.delete('/api/pairing/session/' + sessionId);
    return response.data;
  },

  getAllSessions: async (status = null, authType = null) => {
    const params = {};
    if (status) params.status = status;
    if (authType) params.authType = authType;

    const response = await axiosInstance.get('/api/pairing/sessions', { params });
    return response.data;
  },

  restartSession: async (sessionId) => {
    const response = await axiosInstance.post('/api/pairing/restart/' + sessionId);
    return response.data;
  },

  getHealth: async () => {
    const response = await axiosInstance.get('/api/pairing/health');
    return response.data;
  },

  startQRSession: async (sessionId) => {
    const response = await axiosInstance.post('/session/start/' + sessionId);
    return response.data;
  },

  getQR: async (sessionId) => {
    const response = await axiosInstance.get('/session/qr/' + sessionId, {
      responseType: 'text',
    });
    return response.data;
  },

  getSessionStatus: async (sessionId) => {
    const response = await axiosInstance.get('/session/status/' + sessionId);
    return response.data;
  },

  getAllSessionsStatus: async () => {
    const response = await axiosInstance.get('/session/status/all');
    return response.data;
  },
};

export default apiService;
