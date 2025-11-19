import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import PairingPage from './pages/PairingPage';
import SessionsPage from './pages/SessionsPage';
import './App.css';

const QRPage = React.lazy(() => import('./App.js').then(module => ({
  default: () => <div className="qr-page-wrapper">{module.default}</div>
})));

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <React.Suspense fallback={
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading...</p>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Navigate to="/sessions" replace />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/pairing" element={<PairingPage />} />
              <Route path="/qr" element={<QRPage />} />
              <Route path="*" element={<Navigate to="/sessions" replace />} />
            </Routes>
          </React.Suspense>
        </main>
      </div>
    </Router>
  );
}

export default App;
