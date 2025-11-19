import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-content">
          <Link to="/" className="navbar-brand">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#25D366"/>
              <path d="M16 8C11.6 8 8 11.6 8 16C8 17.4 8.4 18.7 9.1 19.8L8 24L12.3 22.9C13.4 23.6 14.7 24 16 24C20.4 24 24 20.4 24 16C24 11.6 20.4 8 16 8Z" fill="white"/>
            </svg>
            <span>WA Gateway</span>
          </Link>

          <div className="navbar-links">
            <Link
              to="/sessions"
              className={'nav-link ' + (isActive('/sessions') ? 'active' : '')}
            >
              Sessions
            </Link>
            <Link
              to="/pairing"
              className={'nav-link ' + (isActive('/pairing') ? 'active' : '')}
            >
              Phone Pairing
            </Link>
            <Link
              to="/qr"
              className={'nav-link ' + (isActive('/qr') ? 'active' : '')}
            >
              QR Code
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
