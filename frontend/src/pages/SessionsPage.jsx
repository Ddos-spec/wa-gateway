import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api.service';
import websocketService from '../services/websocket.service';
import SessionCard from '../components/SessionCard';
import './SessionsPage.css';

const SessionsPage = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAuthType, setFilterAuthType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testSession, setTestSession] = useState(null);
  const [testRecipient, setTestRecipient] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from WA Gateway!');

  useEffect(() => {
    websocketService.connect();
    loadSessions();

    const interval = setInterval(loadSessions, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const loadSessions = async () => {
    try {
      setError('');

      const [pairingSessions, qrSessions] = await Promise.allSettled([
        apiService.getAllSessions(),
        apiService.getAllSessionsStatus(),
      ]);

      const allSessions = [];

      if (pairingSessions.status === 'fulfilled') {
        allSessions.push(...pairingSessions.value.sessions);
      }

      if (qrSessions.status === 'fulfilled') {
        const qrSessionsList = Object.entries(qrSessions.value).map(([sessionId, data]) => ({
          sessionId,
          status: data.status,
          authType: 'qr',
          lastActivity: Date.now(),
        }));
        allSessions.push(...qrSessionsList);
      }

      const uniqueSessions = allSessions.reduce((acc, session) => {
        const existing = acc.find(s => s.sessionId === session.sessionId);
        if (!existing) {
          acc.push(session);
        }
        return acc;
      }, []);

      setSessions(uniqueSessions);
    } catch (err) {
      setError('Failed to load sessions: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = (session) => {
    setTestSession(session);
    setTestRecipient(session.phoneNumber || '');
    setShowTestModal(true);
  };

  const handleSendTestMessage = async () => {
    try {
      if (!testRecipient || !testMessage) {
        alert('Please enter recipient and message');
        return;
      }

      await apiService.sendMessage(testSession.sessionId, testRecipient, testMessage);
      alert('Test message sent successfully!');
      setShowTestModal(false);
      setTestSession(null);
      setTestRecipient('');
    } catch (err) {
      alert('Failed to send test message: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleRestart = async (session) => {
    try {
      if (!window.confirm('Are you sure you want to restart session ' + session.sessionId + '?')) {
        return;
      }

      await apiService.restartSession(session.sessionId);
      alert('Session restarted successfully');
      loadSessions();
    } catch (err) {
      alert('Failed to restart session: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDelete = (session) => {
    setSessionToDelete(session);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      await apiService.deleteSession(sessionToDelete.sessionId);
      setShowDeleteModal(false);
      setSessionToDelete(null);
      loadSessions();
    } catch (err) {
      alert('Failed to delete session: ' + (err.response?.data?.message || err.message));
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (filterStatus && session.status !== filterStatus) return false;
    if (filterAuthType && session.authType !== filterAuthType) return false;
    if (searchQuery && !session.sessionId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="sessions-page">
        <div className="container">
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading sessions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sessions-page">
      <div className="container">
        <div className="page-header">
          <h1>WhatsApp Sessions</h1>
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => navigate('/pairing')}>
              + Phone Pairing
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/qr')}>
              + QR Code
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger">
            {error}
            <button className="close-alert" onClick={() => setError('')}>×</button>
          </div>
        )}

        <div className="filters-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="connected">Connected</option>
            <option value="disconnected">Disconnected</option>
            <option value="waiting_pairing">Waiting</option>
            <option value="error">Error</option>
          </select>

          <select
            className="filter-select"
            value={filterAuthType}
            onChange={(e) => setFilterAuthType(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="pairing">Phone Pairing</option>
            <option value="qr">QR Code</option>
            <option value="restored">Restored</option>
          </select>

          <button className="btn btn-refresh" onClick={loadSessions}>
            ↻ Refresh
          </button>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="empty-state">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="50" stroke="#e0e0e0" strokeWidth="4"/>
              <path d="M40 60H80M60 40V80" stroke="#e0e0e0" strokeWidth="4" strokeLinecap="round"/>
            </svg>
            <h3>No sessions found</h3>
            <p>Create your first WhatsApp session to get started</p>
            <div className="empty-state-actions">
              <button className="btn btn-primary" onClick={() => navigate('/pairing')}>
                Start Phone Pairing
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/qr')}>
                Start QR Code
              </button>
            </div>
          </div>
        ) : (
          <div className="sessions-grid">
            {filteredSessions.map(session => (
              <SessionCard
                key={session.sessionId}
                session={session}
                onSendTest={handleSendTest}
                onRestart={handleRestart}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Session</h3>
              <p>Are you sure you want to delete session <strong>{sessionToDelete?.sessionId}</strong>?</p>
              <p className="text-muted">This action cannot be undone.</p>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {showTestModal && (
          <div className="modal-overlay" onClick={() => setShowTestModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Send Test Message</h3>
              <p>Session: <strong>{testSession?.sessionId}</strong></p>

              <div className="form-group">
                <label>Recipient Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="628123456789"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Message</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowTestModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSendTestMessage}>
                  Send Message
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionsPage;
