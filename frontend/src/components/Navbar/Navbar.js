import React from 'react';
import './Navbar.css';

function Navbar({ activeTab, onTabChange }) {
  return (
    <nav className="navbar">
      <div className="logo">WhatsApp Gateway</div>
      <div className="nav-tabs">
        <button
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => onTabChange('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={activeTab === 'log-chat' ? 'active' : ''}
          onClick={() => onTabChange('log-chat')}
        >
          Log Chat
        </button>
        <button
          className={activeTab === 'documentation' ? 'active' : ''}
          onClick={() => onTabChange('documentation')}
        >
          Documentation
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => onTabChange('settings')}
        >
          Settings
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
