import React, { useState } from 'react';
import './DetailSession.css';

function DetailSession({ session, onBack, onUpdateSession, onDeleteSession }) {
  const [showAddWebhookModal, setShowAddWebhookModal] = useState(false);
  const [showReconnectQRModal, setShowReconnectQRModal] = useState(false);
  const [showReconnectPhoneModal, setShowReconnectPhoneModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [reconnectPhoneNumber, setReconnectPhoneNumber] = useState('');
  const [reconnectOtpCode, setReconnectOtpCode] = useState('');
  const [showReconnectOTPModal, setShowReconnectOTPModal] = useState(false);
  const [webhooks, setWebhooks] = useState([]);

  // Webhook event toggles
  const [webhookEventToggles, setWebhookEventToggles] = useState({
    individual: false,
    group: false,
    fromMe: false,
    updateStatus: false,
    image: false,
    video: false,
    audio: false,
    sticker: false,
    document: false
  });

  const availableWebhookEvents = [
    { value: 'message.received', label: 'Message Received', description: 'Triggered when any message is received' },
    { value: 'message.sent', label: 'Message Sent', description: 'Triggered when a message is sent' },
    { value: 'connection.update', label: 'Connection Update', description: 'Triggered when connection status changes' },
    { value: 'qr.generated', label: 'QR Code Generated', description: 'Triggered when QR code is generated for auth' },
    { value: 'auth.success', label: 'Auth Success', description: 'Triggered when authentication succeeds' },
    { value: 'auth.failed', label: 'Auth Failed', description: 'Triggered when authentication fails' },
    { value: 'group.join', label: 'Group Join', description: 'Triggered when joining a group' },
    { value: 'group.leave', label: 'Group Leave', description: 'Triggered when leaving a group' }
  ];

  const generateAPIKey = (sessionId) => {
    return `sk_${sessionId}_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  };

  const generateDummyQR = () => {
    return "data:image/svg+xml," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <rect width="100%" height="100%" fill="white"/>
        <rect x="10" y="10" width="20" height="20" fill="black"/>
        <rect x="50" y="10" width="20" height="20" fill="black"/>
        <rect x="90" y="10" width="20" height="20" fill="black"/>
        <rect x="10" y="50" width="20" height="20" fill="black"/>
        <rect x="90" y="50" width="20" height="20" fill="black"/>
        <rect x="10" y="90" width="20" height="20" fill="black"/>
        <rect x="50" y="90" width="20" height="20" fill="black"/>
        <rect x="90" y="90" width="20" height="20" fill="black"/>
      </svg>
    `);
  };

  const handleAddWebhook = () => {
    if (!webhookUrl || webhookEvents.length === 0) {
      alert('Please enter webhook URL and select at least one event');
      return;
    }

    const newWebhook = {
      id: Date.now(),
      url: webhookUrl,
      events: webhookEvents
    };

    setWebhooks([...webhooks, newWebhook]);
    setWebhookUrl('');
    setWebhookEvents([]);
    setShowAddWebhookModal(false);
  };

  const handleDeleteWebhook = (webhookId) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) {
      return;
    }
    setWebhooks(webhooks.filter(w => w.id !== webhookId));
  };

  const handleToggleWebhookEvent = (eventValue) => {
    if (webhookEvents.includes(eventValue)) {
      setWebhookEvents(webhookEvents.filter(e => e !== eventValue));
    } else {
      setWebhookEvents([...webhookEvents, eventValue]);
    }
  };

  const handleToggleWebhookEventType = (eventType) => {
    setWebhookEventToggles({
      ...webhookEventToggles,
      [eventType]: !webhookEventToggles[eventType]
    });
  };

  const handleReconnectWithQR = () => {
    setShowReconnectQRModal(true);
  };

  const handleQRReconnectConfirm = () => {
    alert(`Session "${session.name}" reconnected successfully with QR!`);
    setShowReconnectQRModal(false);
    if (onUpdateSession) {
      onUpdateSession({ ...session, status: 'connected', lastActivity: 'Just now' });
    }
  };

  const handleReconnectWithPhone = () => {
    if (!reconnectPhoneNumber) {
      alert('Please enter a phone number');
      return;
    }

    // Generate dummy OTP code
    const dummyOTP = Math.floor(10000000 + Math.random() * 90000000).toString();
    setReconnectOtpCode(dummyOTP);

    setShowReconnectPhoneModal(false);
    setShowReconnectOTPModal(true);
  };

  const handleReconnectOTPConfirm = () => {
    if (reconnectOtpCode.length !== 8) {
      alert('Please enter a valid 8-digit OTP code');
      return;
    }

    alert(`Session "${session.name}" reconnected successfully with phone number ${reconnectPhoneNumber}!`);
    setShowReconnectOTPModal(false);
    setReconnectPhoneNumber('');
    setReconnectOtpCode('');

    if (onUpdateSession) {
      onUpdateSession({ ...session, status: 'connected', lastActivity: 'Just now' });
    }
  };

  const handleDeleteSession = () => {
    if (window.confirm(`Are you sure you want to delete session "${session.name}"? This action cannot be undone.`)) {
      if (onDeleteSession) {
        onDeleteSession(session.id, session.name);
      }
    }
  };

  return (
    <div className="session-detail">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <div className="detail-title-row">
          <h1>{session.name}</h1>
          <button className="delete-session-btn" onClick={handleDeleteSession}>
            🗑️ Delete Session
          </button>
        </div>
      </div>

      <div className="detail-grid">
        {/* Connection Status Card */}
        <div className="detail-card">
          <h2>Connection Status</h2>
          <div className="status-content">
            <div className={`connection-badge ${session.status}`}>
              <span className="status-dot"></span>
              {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </div>
            <p className="last-activity">Last Activity: {session.lastActivity}</p>

            <div className="reconnect-actions">
              <h3>Reconnect Session (Emergency)</h3>
              <p className="help-text">Use these options if your session gets disconnected</p>
              <div className="reconnect-buttons">
                <button
                  className="reconnect-btn qr-btn"
                  onClick={handleReconnectWithQR}
                >
                  📱 Reconnect with QR Code
                </button>
                <button
                  className="reconnect-btn phone-btn"
                  onClick={() => setShowReconnectPhoneModal(true)}
                >
                  📞 Reconnect with Phone
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* API Key Card */}
        <div className="detail-card">
          <h2>API Key</h2>
          <div className="api-key-content">
            <div className="api-key-box">
              <code>{generateAPIKey(session.id)}</code>
              <button className="copy-btn" onClick={() => {
                navigator.clipboard.writeText(generateAPIKey(session.id));
                alert('API Key copied to clipboard!');
              }}>
                📋 Copy
              </button>
            </div>
            <p className="help-text">Use this API key to authenticate requests for this session</p>
          </div>
        </div>

        {/* Webhooks Card */}
        <div className="detail-card webhooks-card">
          <div className="card-header">
            <h2>Webhooks</h2>
            <button
              className="add-webhook-btn"
              onClick={() => setShowAddWebhookModal(true)}
            >
              + Add Webhook
            </button>
          </div>

          {/* Webhook Event Toggles */}
          <div className="webhook-event-toggles">
            <h3>Webhook Events (Content Type Filters)</h3>
            <p className="help-text" style={{ marginBottom: '1rem' }}>
              Filter message content types for ALL webhooks in this session. Only applies to message events.
            </p>
            <div className="toggle-grid">
              <div className="toggle-item">
                <span className="toggle-label">Webhook Individual</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.individual ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('individual')}
                >
                  {webhookEventToggles.individual ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Group</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.group ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('group')}
                >
                  {webhookEventToggles.group ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook From Me</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.fromMe ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('fromMe')}
                >
                  {webhookEventToggles.fromMe ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Update Status</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.updateStatus ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('updateStatus')}
                >
                  {webhookEventToggles.updateStatus ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Image</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.image ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('image')}
                >
                  {webhookEventToggles.image ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Video</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.video ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('video')}
                >
                  {webhookEventToggles.video ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Audio</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.audio ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('audio')}
                >
                  {webhookEventToggles.audio ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Sticker</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.sticker ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('sticker')}
                >
                  {webhookEventToggles.sticker ? 'Yes' : 'No'}
                </button>
              </div>

              <div className="toggle-item">
                <span className="toggle-label">Webhook Document</span>
                <button
                  className={`toggle-btn ${webhookEventToggles.document ? 'active' : ''}`}
                  onClick={() => handleToggleWebhookEventType('document')}
                >
                  {webhookEventToggles.document ? 'Yes' : 'No'}
                </button>
              </div>
            </div>
          </div>

          <div className="webhooks-list">
            {webhooks.length > 0 ? (
              webhooks.map(webhook => (
                <div key={webhook.id} className="webhook-item">
                  <div className="webhook-url">
                    <strong>URL:</strong> {webhook.url}
                  </div>
                  <div className="webhook-events">
                    <strong>Events:</strong>
                    <div className="event-tags">
                      {webhook.events.map(event => (
                        <span key={event} className="event-tag">{event}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="delete-webhook-btn"
                    onClick={() => handleDeleteWebhook(webhook.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))
            ) : (
              <p className="no-webhooks">No webhooks configured. Click "Add Webhook" to add one.</p>
            )}
          </div>
        </div>
      </div>

      {/* Add Webhook Modal */}
      {showAddWebhookModal && (
        <div className="modal-overlay" onClick={() => setShowAddWebhookModal(false)}>
          <div className="modal-content webhook-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Webhook</h2>
              <button className="modal-close" onClick={() => setShowAddWebhookModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="webhookUrl">Webhook URL</label>
                <input
                  type="url"
                  id="webhookUrl"
                  placeholder="https://your-domain.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Select Events (System/Lifecycle Events)</label>
                <p className="help-text" style={{ marginBottom: '0.75rem' }}>
                  Choose which system events should trigger this webhook
                </p>
                <div className="webhook-events-selector">
                  {availableWebhookEvents.map(event => (
                    <label key={event.value} className="event-checkbox-enhanced">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(event.value)}
                        onChange={() => handleToggleWebhookEvent(event.value)}
                      />
                      <div className="event-info">
                        <span className="event-label">{event.label}</span>
                        <span className="event-description">{event.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => {
                  setShowAddWebhookModal(false);
                  setWebhookUrl('');
                  setWebhookEvents([]);
                }}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleAddWebhook}
              >
                Add Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconnect QR Modal */}
      {showReconnectQRModal && (
        <div className="modal-overlay" onClick={() => setShowReconnectQRModal(false)}>
          <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reconnect {session.name} with QR Code</h2>
              <button className="modal-close" onClick={() => setShowReconnectQRModal(false)}>
                &times;
              </button>
            </div>

            <div className="qr-content">
              <div className="qr-placeholder">
                <img src={generateDummyQR()} alt="QR Code" />
              </div>
              <p>Open WhatsApp on your phone, tap Menu or Settings and select "Linked Devices"</p>
              <p>Point your phone to this QR code to reconnect</p>
            </div>

            <div className="modal-footer">
              <button
                className="create-btn"
                onClick={handleQRReconnectConfirm}
              >
                Confirm QR Scanned
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconnect Phone Modal */}
      {showReconnectPhoneModal && (
        <div className="modal-overlay" onClick={() => setShowReconnectPhoneModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reconnect {session.name} with Phone</h2>
              <button className="modal-close" onClick={() => setShowReconnectPhoneModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="reconnectPhoneNumber">Phone Number</label>
                <input
                  type="tel"
                  id="reconnectPhoneNumber"
                  placeholder="Enter your phone number with country code (e.g. 6281234567890)"
                  value={reconnectPhoneNumber}
                  onChange={(e) => setReconnectPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowReconnectPhoneModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleReconnectWithPhone}
              >
                Send Pairing Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconnect OTP Modal */}
      {showReconnectOTPModal && (
        <div className="modal-overlay" onClick={() => setShowReconnectOTPModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Enter Pairing Code for {session.name}</h2>
              <button className="modal-close" onClick={() => setShowReconnectOTPModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p>A pairing code has been sent to: <strong>{reconnectPhoneNumber}</strong></p>
              <div className="form-group">
                <label htmlFor="reconnectOtpCode">Enter Pairing Code</label>
                <div className="otp-input-container">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <input
                      key={index}
                      type="text"
                      className="otp-digit-input"
                      maxLength="1"
                      value={reconnectOtpCode[index] || ''}
                      onChange={(e) => {
                        const newOtp = reconnectOtpCode.split('');
                        newOtp[index] = e.target.value;
                        setReconnectOtpCode(newOtp.join(''));

                        // Move to next input if value was entered
                        if (e.target.value && index < 7) {
                          const nextInput = document.getElementById(`reconnect-otp-digit-${index + 1}`);
                          if (nextInput) nextInput.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        // Move to previous input on backspace
                        if (e.key === 'Backspace' && !reconnectOtpCode[index] && index > 0) {
                          const prevInput = document.getElementById(`reconnect-otp-digit-${index - 1}`);
                          if (prevInput) prevInput.focus();
                        }
                      }}
                      id={`reconnect-otp-digit-${index}`}
                    />
                  ))}
                </div>
                <div className="otp-display">
                  <p>Your pairing code:</p>
                  <div className="otp-code-display">
                    {reconnectOtpCode.split('').map((digit, index) => (
                      <div key={index} className="otp-digit">{digit}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowReconnectOTPModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleReconnectOTPConfirm}
              >
                Confirm Pairing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DetailSession;
