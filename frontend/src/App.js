import './App.scss';
import "../src/styles/main.scss";
import React, { useEffect, useState } from 'react'
import SocketConnection from './SocketConnection'
import { checkApiKey } from './clients/ApiClient'
import ErrorModal from './components/error_modal/ErrorModal'; // Import your ErrorModal component

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [enteredApiKey, setEnteredApiKey] = useState('')
  const [errorModalOpen, setErrorModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    handleCheckApiKey();
  }, []);

  const handleCheckApiKey = async () => {
    // We handle the case there is no spi key
    if (enteredApiKey === '') {
      try{
        const result = await checkApiKey(enteredApiKey);
        if (result.success) {
          setAuthenticated(true);
        }
      }
      catch (error) {
        console.log('api_key is not empty')
      }
      return
    }
    try {
      const result = await checkApiKey(enteredApiKey);
      if (result.success) {
        setAuthenticated(true);
      } else {
        setErrorMessage(result.message || 'API key check failed.'); // or result.error or a default message
        setErrorModalOpen(true);
      }
    } catch (error) {
      setErrorMessage(error.message || 'An unexpected error occurred.');
      setErrorModalOpen(true);
    }
  };

  return (
    <div className="App">
      {authenticated ? (
        <SocketConnection apiKey={enteredApiKey} />
      ) : (
        <div className="authorizationPage">
          <div className="authorization">
            <div className="title">
              <h3>This page is protected</h3>
            </div>
            <input
            type="password"
            id="apiKey"
            name="apiKey"
            placeholder="Enter your api key"
            value={enteredApiKey}
            onChange={
              evt => {
                setEnteredApiKey(evt.target.value)
              }
            }/>
            <button onClick={handleCheckApiKey}>Continue</button>
          </div>
        </div>
      )}
      {errorModalOpen && (
        <ErrorModal
          errorMessage={errorMessage}
          setErrorModalOpen={setErrorModalOpen}
        />
      )}
    </div>
  )
}

export default App;
