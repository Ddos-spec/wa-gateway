import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api.service';
import websocketService from '../services/websocket.service';
import PairingCodeDisplay from '../components/PairingCodeDisplay';
import StatusBadge from '../components/StatusBadge';
import './PairingPage.css';

const PairingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sessionName, setSessionName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('62');
  const [pairingCode, setPairingCode] = useState('');
  const [status, setStatus] = useState('');
  const [countdown, setCountdown] = useState(300);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    websocketService.connect();

    return () => {
      if (sessionId) {
        websocketService.unsubscribeFromSession(sessionId);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    let timer;
    if (step === 2 && countdown > 0 && status !== 'connected') {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0 && status !== 'connected') {
      setError('Pairing code expired. Please try again.');
      handleCancel();
    }

    return () => clearTimeout(timer);
  }, [step, countdown, status]);

  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/\D/g, '');

    if (!cleaned.startsWith('62')) {
      return '62';
    }

    return cleaned;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const validateForm = () => {
    if (!sessionName.trim()) {
      setError('Session name is required');
      return false;
    }

    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      setError('Invalid phone number. Must be 10-15 digits starting with 62');
      return false;
    }

    if (!phoneNumber.startsWith('62')) {
      setError('Phone number must start with 62 (Indonesia)');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const generatedSessionId = sessionName.replace(/\s+/g, '_').toUpperCase();
      setSessionId(generatedSessionId);

      const result = await apiService.startPairingSession(generatedSessionId, phoneNumber);

      setPairingCode(result.pairingCode);
      setStatus(result.status);
      setCountdown(result.expiresIn || 300);
      setStep(2);

      websocketService.subscribeToSession(generatedSessionId, {
        onPairingCode: (data) => {
          console.log('Pairing code event:', data);
        },
        onStatus: (data) => {
          console.log('Status event:', data);
          setStatus(data.status);
        },
        onConnected: (data) => {
          console.log('Connected event:', data);
          setStatus('connected');
          setStep(3);
        },
        onError: (data) => {
          console.error('Error event:', data);
          setError(data.error || 'An error occurred');
          setStatus('error');
        },
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to start pairing session');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (sessionId) {
      apiService.deleteSession(sessionId).catch(console.error);
      websocketService.unsubscribeFromSession(sessionId);
    }
    setStep(1);
    setSessionName('');
    setPhoneNumber('62');
    setPairingCode('');
    setStatus('');
    setCountdown(300);
    setError('');
    setSessionId('');
  };

  const handleGoToSessions = () => {
    navigate('/sessions');
  };

  const renderStep1 = () => (
    <div className="pairing-form">
      <h2>Start Phone Pairing</h2>
      <p className="text-muted">Link WhatsApp using an 8-digit pairing code</p>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="sessionName">Session Name</label>
          <input
            type="text"
            className="form-control"
            id="sessionName"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g., My WhatsApp Bot"
            required
            disabled={loading}
          />
          <small className="form-text text-muted">
            A unique name to identify this WhatsApp session
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="phoneNumber">Phone Number</label>
          <input
            type="tel"
            className="form-control"
            id="phoneNumber"
            value={phoneNumber}
            onChange={handlePhoneChange}
            placeholder="628123456789"
            required
            disabled={loading}
          />
          <small className="form-text text-muted">
            Indonesia format (62 + number). Example: 628123456789
          </small>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>
              Generating Code...
            </>
          ) : (
            'Generate Pairing Code'
          )}
        </button>
      </form>
    </div>
  );

  const renderStep2 = () => (
    <div className="pairing-code-container">
      <h2>Enter This Code in WhatsApp</h2>

      <PairingCodeDisplay
        code={pairingCode}
        countdown={countdown}
        status={status}
      />

      <div className="pairing-instructions">
        <h5>Instructions:</h5>
        <ol>
          <li>Open WhatsApp on your phone</li>
          <li>Go to <strong>Settings → Linked Devices</strong></li>
          <li>Tap <strong>"Link a Device"</strong></li>
          <li>Tap <strong>"Link with phone number instead"</strong></li>
          <li>Enter the code shown above</li>
        </ol>
      </div>

      <div className="status-container">
        <StatusBadge status={status} showIcon={true} />
      </div>

      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      )}

      <button
        className="btn btn-secondary btn-block mt-3"
        onClick={handleCancel}
      >
        Cancel
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="success-container">
      <div className="success-icon">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="40" r="40" fill="#28a745"/>
          <path d="M25 40L35 50L55 30" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <h2>Successfully Connected!</h2>
      <p className="text-muted">Your WhatsApp session is now active</p>

      <div className="session-info">
        <div className="info-row">
          <span className="info-label">Session Name:</span>
          <span className="info-value">{sessionName}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Phone Number:</span>
          <span className="info-value">{phoneNumber}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Status:</span>
          <span className="info-value">
            <StatusBadge status="connected" showIcon={true} />
          </span>
        </div>
      </div>

      <button
        className="btn btn-primary btn-block mt-4"
        onClick={handleGoToSessions}
      >
        Go to Sessions
      </button>
    </div>
  );

  return (
    <div className="pairing-page">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="pairing-card">
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PairingPage;
