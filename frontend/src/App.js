import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [authMethod, setAuthMethod] = useState('qr');
  const [otpCode, setOtpCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [folders, setFolders] = useState([
    { id: 1, name: 'Marketing', sessionIds: [1, 3] },
    { id: 2, name: 'Support', sessionIds: [2] }
  ]);
  const [sessions, setSessions] = useState([
    { id: 1, name: 'Session 1', status: 'connected', lastActivity: 'Just now', folderId: 1 },
    { id: 2, name: 'Session 2', status: 'disconnected', lastActivity: '2 minutes ago', folderId: 2 },
    { id: 3, name: 'Session 3', status: 'connected', lastActivity: '5 minutes ago', folderId: 1 }
  ]);
  const [logs, setLogs] = useState([
    { id: 1, timestamp: '10:30:15', message: 'Session 1 connected successfully', type: 'info' },
    { id: 2, timestamp: '10:29:42', message: 'Session 2 connection failed', type: 'error' },
    { id: 3, timestamp: '10:28:33', message: 'New message received from +62812345678', type: 'info' },
    { id: 4, timestamp: '10:27:55', message: 'Session 3 authenticated', type: 'info' }
  ]);

  // Simulate fetching data from backend periodically
  useEffect(() => {
    const fetchMonitorData = async () => {
      try {
        // In a real implementation, this would fetch from your backend API
        // const response = await fetch('http://localhost:5000/api/status');
        // const data = await response.json();

        // For now we'll simulate with dummy data
        const dummySessions = sessions.map(session => ({
          ...session,
          status: Math.random() > 0.2 ? 'connected' : 'disconnected'
        }));

        // Randomly add a new log entry occasionally
        if (Math.random() > 0.7) {
          const newLog = {
            id: logs.length + 1,
            timestamp: new Date().toLocaleTimeString(),
            message: Math.random() > 0.5
              ? `New activity on ${dummySessions[Math.floor(Math.random() * dummySessions.length)].name}`
              : 'System check completed',
            type: Math.random() > 0.8 ? 'error' : 'info'
          };

          setLogs(prevLogs => [newLog, ...prevLogs.slice(0, 9)]); // Keep only 10 most recent logs
        }

        setSessions(dummySessions);
      } catch (error) {
        console.error('Error fetching monitor data:', error);
      }
    };

    // Fetch data immediately
    fetchMonitorData();

    // Set up interval to fetch data every 5 seconds
    const intervalId = setInterval(fetchMonitorData, 5000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [logs.length, sessions]); // Added sessions as dependency

  const handleCreateFolder = () => {
    if (!folderName) {
      alert('Please enter a folder name');
      return;
    }

    const newFolder = {
      id: folders.length + 1,
      name: folderName,
      sessionIds: []
    };

    setFolders([...folders, newFolder]);
    setShowNewFolderModal(false);
    setFolderName('');
  };

  // Generate a dummy QR code for display
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
        <rect x="30" y="30" width="10" height="10" fill="black"/>
        <rect x="40" y="30" width="10" height="10" fill="black"/>
        <rect x="70" y="40" width="10" height="10" fill="black"/>
        <rect x="80" y="40" width="10" height="10" fill="black"/>
        <rect x="40" y="70" width="10" height="10" fill="black"/>
        <rect x="50" y="70" width="10" height="10" fill="black"/>
        <rect x="60" y="70" width="10" height="10" fill="black"/>
        <rect x="70" y="70" width="10" height="10" fill="black"/>
        <rect x="80" y="70" width="10" height="10" fill="black"/>
        <rect x="40" y="80" width="10" height="10" fill="black"/>
        <rect x="60" y="80" width="10" height="10" fill="black"/>
        <rect x="70" y="80" width="10" height="10" fill="black"/>
        <rect x="80" y="80" width="10" height="10" fill="black"/>
        <rect x="30" y="90" width="10" height="10" fill="black"/>
        <rect x="40" y="90" width="10" height="10" fill="black"/>
        <rect x="50" y="90" width="10" height="10" fill="black"/>
        <rect x="60" y="90" width="10" height="10" fill="black"/>
        <rect x="70" y="90" width="10" height="10" fill="black"/>
        <rect x="80" y="90" width="10" height="10" fill="black"/>
        <rect x="30" y="50" width="40" height="10" fill="black"/>
        <rect x="90" y="30" width="10" height="40" fill="black"/>
        <rect x="30" y="60" width="40" height="10" fill="black"/>
        <rect x="50" y="30" width="10" height="40" fill="black"/>
        <rect x="60" y="30" width="10" height="40" fill="black"/>
      </svg>
    `);
  };

  const handleCreateSession = () => {
    if (!sessionName) {
      alert('Please enter a session name');
      return;
    }

    if (authMethod === 'qr') {
      setShowNewSessionModal(false);
      setAuthMethod('qr');
      setShowQRModal(true); // Show QR modal after session creation
    } else {
      setShowNewSessionModal(false);
      setShowPhoneModal(true); // Show phone modal to enter phone number
    }
  };

  const handlePhoneSubmit = () => {
    if (!phoneNumber) {
      alert('Please enter a phone number');
      return;
    }

    // Generate dummy OTP code (8 digits)
    const dummyOTP = Math.floor(10000000 + Math.random() * 90000000).toString();
    setOtpCode(dummyOTP);

    setShowPhoneModal(false);
    setShowOTPModal(true); // Show OTP modal after phone number is submitted
  };

  const handleQRConfirm = () => {
    alert(`QR code for session "${sessionName}" has been confirmed!`);
    setShowQRModal(false);
    setSessionName('');
  };

  const handleOTPConfirm = () => {
    if (otpCode.length !== 8) {
      alert('Please enter a valid 8-digit OTP code');
      return;
    }

    alert(`Phone verification for ${phoneNumber} with OTP ${otpCode} completed!`);
    setShowOTPModal(false);
    setSessionName('');
    setPhoneNumber('');
    setOtpCode('');
  };

  return (
    <div className="App">
      <nav className="navbar">
        <div className="logo">WhatsApp Gateway</div>
        <div className="nav-tabs">
          <button
            className={activeTab === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={activeTab === 'messages' ? 'active' : ''}
            onClick={() => setActiveTab('messages')}
          >
            Messages
          </button>
          <button
            className={activeTab === 'contacts' ? 'active' : ''}
            onClick={() => setActiveTab('contacts')}
          >
            Contacts
          </button>
          <button
            className={activeTab === 'documentation' ? 'active' : ''}
            onClick={() => setActiveTab('documentation')}
          >
            Documentation
          </button>
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
      </nav>

      <div className="container">
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            <div className="dashboard-header">
              <h1>WhatsApp Gateway Dashboard</h1>
              <div className="dashboard-actions">
                <button className="new-folder-btn" onClick={() => setShowNewFolderModal(true)}>
                  New Folder
                </button>
                <button className="new-session-btn" onClick={() => setShowNewSessionModal(true)}>
                  New Session
                </button>
              </div>
            </div>

            <div className="status-monitor">
              <div className="monitor-box">
                <div className="monitor-content">
                  <h2>System Status</h2>
                  <div className="status-overview">
                    <div className="status-item">
                      <span className="status-label">Overall Connection</span>
                      <span className={`status-value ${connectionStatus}`}>
                        {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Active Sessions</span>
                      <span className="status-value">
                        {sessions.filter(s => s.status === 'connected').length}/{sessions.length}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Last Update</span>
                      <span className="status-value">{new Date().toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sessions-list">
                <h3>Sessions</h3>
                <div className="folders-container">
                  {folders.map(folder => {
                    const folderSessions = sessions.filter(session => session.folderId === folder.id);
                    return (
                      <div key={folder.id} className="folder-section">
                        <div className="folder-header">
                          <h4>{folder.name}</h4>
                          <span className="session-count">({folderSessions.length} sessions)</span>
                        </div>
                        <div className="folder-sessions">
                          {folderSessions.map(session => (
                            <div key={session.id} className="session-card">
                              <div className="session-header">
                                <span className="session-name">{session.name}</span>
                                <span className={`session-status ${session.status}`}>
                                  {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                                </span>
                              </div>
                              <div className="session-details">
                                <div className="detail-item">
                                  <span className="detail-label">Last Activity:</span>
                                  <span className="detail-value">{session.lastActivity}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Unorganized sessions */}
                  {sessions.filter(session => !session.folderId).length > 0 && (
                    <div className="folder-section">
                      <div className="folder-header">
                        <h4>Unorganized</h4>
                        <span className="session-count">({sessions.filter(session => !session.folderId).length} sessions)</span>
                      </div>
                      <div className="folder-sessions">
                        {sessions.filter(session => !session.folderId).map(session => (
                          <div key={session.id} className="session-card">
                            <div className="session-header">
                              <span className="session-name">{session.name}</span>
                              <span className={`session-status ${session.status}`}>
                                {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                              </span>
                            </div>
                            <div className="session-details">
                              <div className="detail-item">
                                <span className="detail-label">Last Activity:</span>
                                <span className="detail-value">{session.lastActivity}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="messages">
            <h1>Message History</h1>
            <div className="message-list">
              <div className="message-item">
                <div className="contact">+1234567890</div>
                <div className="message-content">Hello, how are you?</div>
                <div className="timestamp">2025-11-20 10:30</div>
              </div>
              <div className="message-item">
                <div className="contact">+0987654321</div>
                <div className="message-content">Thanks for your help!</div>
                <div className="timestamp">2025-11-20 09:15</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="contacts">
            <h1>Contact List</h1>
            <div className="contact-list">
              <div className="contact-item">
                <div className="contact-name">John Doe</div>
                <div className="contact-phone">+1234567890</div>
              </div>
              <div className="contact-item">
                <div className="contact-name">Jane Smith</div>
                <div className="contact-phone">+0987654321</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documentation' && (
          <div className="documentation">
            <h1>WA-Gateway API Documentation</h1>

            <div className="doc-section">
              <h2>Body POST in JSON Format</h2>
            </div>

            <div className="doc-section">
              <h2>Send Text, Image, Video, Audio, Document, Sticker</h2>
              <div className="api-endpoint">
                <div className="method-get">GET</div>
                <div className="method-post">POST</div>
                <code>https://projek-n8n-whatsappgateway.qk6yxt.easypanel.host/api/v2/send-message</code>
              </div>

              <table className="params-table">
                <thead>
                  <tr>
                    <th>Parameter / Body</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>apikey</td>
                    <td>String</td>
                    <td>Required. Apikey your session.</td>
                  </tr>
                  <tr>
                    <td>mtype</td>
                    <td>Enum</td>
                    <td>Required. text, image, video, audio, audioconvert, document, sticker, stickerconvert</td>
                  </tr>
                  <tr>
                    <td>receiver</td>
                    <td>String</td>
                    <td>Required. Receiver Phone Number with Country Code (e.g: 62812345678) or id group.</td>
                  </tr>
                  <tr>
                    <td>text</td>
                    <td>String</td>
                    <td>Required if mtype is text. Text Message.</td>
                  </tr>
                  <tr>
                    <td>url</td>
                    <td>Url</td>
                    <td>Required if mtype is image, video, audio, audioconvert, document, sticker, stickerconvert. url file. example : http://domain.com/example.jpg</td>
                  </tr>
                  <tr>
                    <td>filename</td>
                    <td>String</td>
                    <td>Optional. if you want a custom name of the document sent.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="doc-section">
              <h2>Fetch Group</h2>
              <div className="api-endpoint">
                <div className="method-get">GET</div>
                <div className="method-post">POST</div>
                <code>https://projek-n8n-whatsappgateway.qk6yxt.easypanel.host/api/v2/fetch-group</code>
              </div>

              <table className="params-table">
                <thead>
                  <tr>
                    <th>Parameter / Body</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>apikey</td>
                    <td>String</td>
                    <td>Required. Apikey your session.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="doc-section">
              <h2>Fetch Member Group</h2>
              <div className="api-endpoint">
                <div className="method-get">GET</div>
                <div className="method-post">POST</div>
                <code>https://projek-n8n-whatsappgateway.qk6yxt.easypanel.host/api/v2/fetch-member</code>
              </div>

              <table className="params-table">
                <thead>
                  <tr>
                    <th>Parameter / Body</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>apikey</td>
                    <td>String</td>
                    <td>Required. Apikey your session.</td>
                  </tr>
                  <tr>
                    <td>idgroup</td>
                    <td>String</td>
                    <td>Required. ID group WhatsApp (e.g: 120163044481549146@g.us)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings">
            <h1>Settings</h1>
            <div className="settings-form">
              <div className="form-group">
                <label>API Endpoint</label>
                <input type="text" placeholder="http://localhost:3000/api" />
              </div>
              <div className="form-group">
                <label>Connection Status</label>
                <div className="status-indicator connected">Connected</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="modal-overlay" onClick={() => setShowNewSessionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Session</h2>
              <button className="modal-close" onClick={() => setShowNewSessionModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="sessionName">Session Name</label>
                <input
                  type="text"
                  id="sessionName"
                  placeholder="Enter session name"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                />
              </div>

              <div className="auth-method-selection">
                <h3>Select Authentication Method</h3>
                <div className="auth-methods">
                  <button
                    className={authMethod === 'qr' ? 'selected' : ''}
                    onClick={() => setAuthMethod('qr')}
                  >
                    QR Code
                  </button>
                  <button
                    className={authMethod === 'phone' ? 'selected' : ''}
                    onClick={() => setAuthMethod('phone')}
                  >
                    Phone Number
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowNewSessionModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleCreateSession}
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Scan QR Code for {sessionName}</h2>
              <button className="modal-close" onClick={() => setShowQRModal(false)}>
                &times;
              </button>
            </div>

            <div className="qr-content">
              <div className="qr-placeholder">
                <img src={generateDummyQR()} alt="QR Code" />
              </div>
              <p>Open WhatsApp on your phone, tap Menu or Settings and select "Linked Devices"</p>
              <p>Point your phone to this QR code to log in</p>
            </div>

            <div className="modal-footer">
              <button
                className="create-btn"
                onClick={handleQRConfirm}
              >
                Confirm QR Scanned
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phone Number Modal */}
      {showPhoneModal && (
        <div className="modal-overlay" onClick={() => setShowPhoneModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Enter Phone Number for {sessionName}</h2>
              <button className="modal-close" onClick={() => setShowPhoneModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="phoneNumber">Phone Number</label>
                <input
                  type="tel"
                  id="phoneNumber"
                  placeholder="Enter your phone number with country code (e.g. 6281234567890)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowPhoneModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handlePhoneSubmit}
              >
                Send OTP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTP Modal */}
      {showOTPModal && (
        <div className="modal-overlay" onClick={() => setShowOTPModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Verification for {sessionName}</h2>
              <button className="modal-close" onClick={() => setShowOTPModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p>A verification code has been sent to: <strong>{phoneNumber}</strong></p>
              <div className="form-group">
                <label htmlFor="otpCode">Enter OTP Code</label>
                <div className="otp-input-container">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <input
                      key={index}
                      type="text"
                      className="otp-digit-input"
                      maxLength="1"
                      value={otpCode[index] || ''}
                      onChange={(e) => {
                        const newOtp = otpCode.split('');
                        newOtp[index] = e.target.value;
                        setOtpCode(newOtp.join(''));

                        // Move to next input if value was entered
                        if (e.target.value && index < 7) {
                          const nextInput = document.getElementById(`otp-digit-${index + 1}`);
                          if (nextInput) nextInput.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        // Move to previous input on backspace
                        if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
                          const prevInput = document.getElementById(`otp-digit-${index - 1}`);
                          if (prevInput) prevInput.focus();
                        }
                      }}
                      id={`otp-digit-${index}`}
                    />
                  ))}
                </div>
                <div className="otp-display">
                  <p>Your dummy OTP code:</p>
                  <div className="otp-code-display">
                    {otpCode.split('').map((digit, index) => (
                      <div key={index} className="otp-digit">{digit}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowOTPModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleOTPConfirm}
              >
                Confirm OTP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="modal-overlay" onClick={() => setShowNewFolderModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Folder</h2>
              <button className="modal-close" onClick={() => setShowNewFolderModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="folderName">Folder Name</label>
                <input
                  type="text"
                  id="folderName"
                  placeholder="Enter folder name"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowNewFolderModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleCreateFolder}
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;