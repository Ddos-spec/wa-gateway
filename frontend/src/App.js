import React, { useState } from 'react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [message, setMessage] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleSendMessage = () => {
    if (!phoneNumber || !message) {
      alert('Please fill in both phone number and message');
      return;
    }
    
    // In a real implementation, this would send the message via the backend
    console.log(`Sending message to ${phoneNumber}: ${message}`);
    alert(`Message sent to ${phoneNumber}!`);
    setMessage('');
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
            <h1>WhatsApp Gateway Dashboard</h1>
            <div className="dashboard-stats">
              <div className="stat-card">
                <h3>Total Messages</h3>
                <p>1,248</p>
              </div>
              <div className="stat-card">
                <h3>Connected Clients</h3>
                <p>24</p>
              </div>
              <div className="stat-card">
                <h3>Uptime</h3>
                <p>99.8%</p>
              </div>
              <div className="stat-card">
                <h3>Status</h3>
                <p className="status-active">Active</p>
              </div>
            </div>
            
            <div className="message-section">
              <h2>Send Message</h2>
              <div className="message-form">
                <input
                  type="text"
                  placeholder="Phone number (with country code)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <textarea
                  placeholder="Your message here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button onClick={handleSendMessage}>Send Message</button>
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
    </div>
  );
}

export default App;