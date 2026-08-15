import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

const socket = io('http://localhost:5000');

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [recipientPublicKey, setRecipientPublicKey] = useState(null);
  const navigate = useNavigate();
  const { recipientUsername } = useParams();
  const username = localStorage.getItem('username');
  const myPrivateKey = localStorage.getItem(`privateKey_${username}`);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!localStorage.getItem('token') || !myPrivateKey) {
      navigate('/login');
      return;
    }

    // Register this user as online (only once)
    if (!registeredRef.current) {
      socket.emit('registerUser', username);
      registeredRef.current = true;
    }

    // Fetch the recipient's public key
    axios.get(`http://localhost:5000/api/auth/publickey/${recipientUsername}`)
      .then((res) => setRecipientPublicKey(res.data.publicKey))
      .catch((err) => console.error(err));

    // Listen for incoming messages
    const handleIncoming = ({ from, encryptedMessage, nonce, self }) => {
      // Only show messages relevant to this conversation
      if (from !== recipientUsername && !self) return;
      if (self && from !== username) return;

      try {
        const decrypted = decryptMessage(encryptedMessage, nonce, recipientPublicKeyRef.current, myPrivateKey);
        setMessages((prev) => [...prev, { from, text: decrypted }]);
      } catch (err) {
        console.error('Decryption failed:', err);
      }
    };

    socket.on('receivePrivateMessage', handleIncoming);

    return () => {
      socket.off('receivePrivateMessage', handleIncoming);
    };
  }, [recipientUsername, navigate, myPrivateKey, username]);

  // Keep a ref to recipientPublicKey so the socket listener always has the latest value
  const recipientPublicKeyRef = useRef(null);
  useEffect(() => {
    recipientPublicKeyRef.current = recipientPublicKey;
  }, [recipientPublicKey]);

  const decryptMessage = (encryptedMessage, nonce, senderPublicKey, myPrivKey) => {
    const decrypted = nacl.box.open(
      decodeBase64(encryptedMessage),
      decodeBase64(nonce),
      decodeBase64(senderPublicKey),
      decodeBase64(myPrivKey)
    );
    return encodeUTF8(decrypted);
  };

  const sendMessage = () => {
    if (input.trim() === '' || !recipientPublicKey) return;

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(
      decodeUTF8(input),
      nonce,
      decodeBase64(recipientPublicKey),
      decodeBase64(myPrivateKey)
    );

    socket.emit('sendPrivateMessage', {
      to: recipientUsername,
      from: username,
      encryptedMessage: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
    });

    setInput('');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <Link to="/chats">← Back</Link>
          <h1>{recipientUsername}</h1>
        </div>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>

      <div className="messages-box">
        {messages.map((msg, index) => (
          <div key={index} className="message">
            <strong>{msg.from}:</strong> {msg.text}
          </div>
        ))}
      </div>

      <div className="input-box">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Chat;