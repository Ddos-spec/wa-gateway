import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import './SessionCard.css';

const SessionCard = ({ session, onSendTest, onRestart, onDelete }) => {
  const [showActions, setShowActions] = useState(false);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(parseInt(timestamp));
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + ' min ago';

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours + ' hour' + (diffHours > 1 ? 's' : '') + ' ago';

    const diffDays = Math.floor(diffHours / 24);
    return diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' ago';
  };

  const getAuthTypeLabel = (authType) => {
    switch (authType) {
      case 'pairing':
        return 'Phone Pairing';
      case 'qr':
        return 'QR Code';
      case 'restored':
        return 'Restored';
      default:
        return authType || 'Unknown';
    }
  };

  const getAuthTypeBadgeClass = (authType) => {
    switch (authType) {
      case 'pairing':
        return 'auth-badge-pairing';
      case 'qr':
        return 'auth-badge-qr';
      case 'restored':
        return 'auth-badge-restored';
      default:
        return 'auth-badge-default';
    }
  };

  return (
    <div className="session-card">
      <div className="session-card-header">
        <h3 className="session-name">{session.sessionId}</h3>
        <div className="dropdown">
          <button
            className="dropdown-toggle"
            onClick={() => setShowActions(!showActions)}
          >
            ⋮
          </button>
          {showActions && (
            <div className="dropdown-menu">
              <button onClick={() => { setShowActions(false); onSendTest(session); }}>
                Send Test
              </button>
              <button onClick={() => { setShowActions(false); onRestart(session); }}>
                Restart
              </button>
              <button onClick={() => { setShowActions(false); onDelete(session); }} className="danger">
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="session-card-body">
        <div className="session-info-row">
          <span className="label">Type:</span>
          <span className={'auth-badge ' + getAuthTypeBadgeClass(session.authType)}>
            {getAuthTypeLabel(session.authType)}
          </span>
        </div>

        <div className="session-info-row">
          <span className="label">Status:</span>
          <StatusBadge status={session.status} showIcon={true} />
        </div>

        {session.phoneNumber && (
          <div className="session-info-row">
            <span className="label">Phone:</span>
            <span className="value">{session.phoneNumber}</span>
          </div>
        )}

        <div className="session-info-row">
          <span className="label">Last Activity:</span>
          <span className="value">{formatDate(session.lastActivity)}</span>
        </div>

        {session.socketConnected !== undefined && (
          <div className="session-info-row">
            <span className="label">Socket:</span>
            <span className={'socket-indicator ' + (session.socketConnected ? 'active' : 'inactive')}>
              {session.socketConnected ? '● Active' : '○ Inactive'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionCard;
