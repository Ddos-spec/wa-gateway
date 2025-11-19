import React from 'react';
import './StatusBadge.css';

const StatusBadge = ({ status, showIcon = false }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          className: 'status-connected',
          text: 'Connected',
          icon: '✓',
        };
      case 'waiting_pairing':
      case 'connecting':
        return {
          className: 'status-waiting',
          text: 'Waiting',
          icon: '⏳',
        };
      case 'disconnected':
        return {
          className: 'status-disconnected',
          text: 'Disconnected',
          icon: '○',
        };
      case 'error':
      case 'logged_out':
        return {
          className: 'status-error',
          text: 'Error',
          icon: '✗',
        };
      case 'reconnecting':
      case 'restarting':
        return {
          className: 'status-reconnecting',
          text: 'Reconnecting',
          icon: '↻',
        };
      default:
        return {
          className: 'status-unknown',
          text: status || 'Unknown',
          icon: '?',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={'status-badge ' + config.className}>
      {showIcon && <span className="status-icon">{config.icon}</span>}
      <span className="status-text">{config.text}</span>
    </span>
  );
};

export default StatusBadge;
