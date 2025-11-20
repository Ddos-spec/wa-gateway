import './App.scss';
import "../src/styles/main.scss";
import React from 'react'
import SocketConnection from './SocketConnection'

function App() {
  // NUKED: All authentication logic removed
  // Direct access to dashboard - no login required
  // Using hardcoded API key from backend .env (test123)
  const API_KEY = 'test123';

  return (
    <div className="App">
      <SocketConnection apiKey={API_KEY} />
    </div>
  )
}

export default App;
