import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { API_URL } from '../config';

const socket = io(API_URL);

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [recipientPublicKey, setRecipientPublicKey] = useState(null);
  const [callStatus, setCallStatus] = useState('idle');
  const [incomingOffer, setIncomingOffer] = useState(null);

  const navigate = useNavigate();
  const { recipientUsername } = useParams();
  const username = localStorage.getItem('username');
  const myPrivateKey = localStorage.getItem(`privateKey_${username}`);
  const registeredRef = useRef(false);
  const recipientPublicKeyRef = useRef(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    if (!localStorage.getItem('token') || !myPrivateKey) {
      navigate('/login');
      return;
    }

    if (!registeredRef.current) {
      socket.emit('registerUser', username);
      registeredRef.current = true;
    }

    axios.get(`${API_URL}/api/auth/publickey/${recipientUsername}`)
      .then((res) => setRecipientPublicKey(res.data.publicKey))
      .catch((err) => console.error(err));

    const handleIncoming = ({ from, encryptedMessage, nonce, self }) => {
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

    socket.on('incomingCall', ({ from, offer }) => {
      if (from !== recipientUsername) return;
      setIncomingOffer(offer);
      setCallStatus('incoming');
    });

    socket.on('callAnswered', async ({ answer }) => {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallStatus('active');
    });

    socket.on('iceCandidate', async ({ candidate }) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('callEnded', () => {
      endCallCleanup();
    });

    return () => {
      socket.off('receivePrivateMessage', handleIncoming);
      socket.off('incomingCall');
      socket.off('callAnswered');
      socket.off('iceCandidate');
      socket.off('callEnded');
    };
  }, [recipientUsername, navigate, myPrivateKey, username]);

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

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('iceCandidate', { to: recipientUsername, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    return pc;
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('callUser', { to: recipientUsername, from: username, offer });
      setCallStatus('calling');
    } catch (err) {
      console.error('Could not start call:', err);
      alert('Could not access microphone. Please allow microphone permission.');
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answerCall', { to: recipientUsername, answer });
      setCallStatus('active');
    } catch (err) {
      console.error('Could not accept call:', err);
      alert('Could not access microphone. Please allow microphone permission.');
    }
  };

  const rejectCall = () => {
    setCallStatus('idle');
    setIncomingOffer(null);
  };

  const endCall = () => {
    socket.emit('endCall', { to: recipientUsername });
    endCallCleanup();
  };

  const endCallCleanup = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setCallStatus('idle');
    setIncomingOffer(null);
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <Link to="/chats">← Back</Link>
          <h1>{recipientUsername}</h1>
        </div>
        <div>
          {callStatus === 'idle' && <button onClick={startCall} className="call-btn">📞 Call</button>}
          {(callStatus === 'calling' || callStatus === 'active') && (
            <button onClick={endCall} className="end-call-btn">End Call</button>
          )}
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </div>

      {callStatus === 'calling' && <p className="call-status">Calling {recipientUsername}...</p>}
      {callStatus === 'active' && <p className="call-status">On call with {recipientUsername}</p>}
      {callStatus === 'incoming' && (
        <div className="incoming-call-box">
          <p>{recipientUsername} is calling you...</p>
          <button onClick={acceptCall} className="call-btn">Accept</button>
          <button onClick={rejectCall} className="end-call-btn">Decline</button>
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay />

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