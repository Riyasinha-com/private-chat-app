import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import { API_URL } from '../config';

function Signup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const keyPair = nacl.box.keyPair();
      const publicKey = encodeBase64(keyPair.publicKey);
      const privateKey = encodeBase64(keyPair.secretKey);

      await axios.post(`${API_URL}/api/auth/signup`, {
        username,
        password,
        publicKey,
      });

      localStorage.setItem(`privateKey_${username}`, privateKey);

      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    }
  };

  return (
    <>
      <div className="brand-header">
        <h2>❄ Frostline</h2>
        <p>Private messages, wrapped in silence</p>
      </div>
      <div className="auth-container">
        <h1>Sign Up</h1>
        <form onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error-text">{error}</p>}
          <button type="submit">Sign Up</button>
        </form>
        <p>Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </>
  );
}

export default Signup;