import React from 'react';
import './PairingCodeDisplay.css';

const PairingCodeDisplay = ({ code, countdown, status }) => {
  const formatCode = (code) => {
    if (!code || code.length !== 8) return code;
    return code.substring(0, 4) + '-' + code.substring(4);
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  };

  const getProgressPercentage = () => {
    return (countdown / 300) * 100;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    alert('Pairing code copied to clipboard!');
  };

  return (
    <div className="pairing-code-display">
      <div className="code-container">
        <div className="code-text">{formatCode(code)}</div>
        <button className="copy-button" onClick={copyToClipboard} title="Copy to clipboard">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="8" y="8" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M4 12H3C2.44772 12 2 11.5523 2 11V3C2 2.44772 2.44772 2 3 2H11C11.5523 2 12 2.44772 12 3V4" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </button>
      </div>

      <div className="countdown-container">
        <div className="countdown-circle">
          <svg width="120" height="120">
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="#e0e0e0"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="#667eea"
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 54}
              strokeDashoffset={2 * Math.PI * 54 * (1 - getProgressPercentage() / 100)}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="countdown-text">{formatCountdown(countdown)}</div>
        </div>
      </div>

      <p className="expiry-text">Code expires in {formatCountdown(countdown)}</p>
    </div>
  );
};

export default PairingCodeDisplay;
