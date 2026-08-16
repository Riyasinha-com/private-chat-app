import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { API_URL } from '../config';

const socket = io(API_URL);

function getInitials(name) {
  return name ? name.slice(0, 2).toUpperCase() : '??';
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ name, picture, small }) {
  if (picture) {
    return <img src={picture} alt={name} className={`avatar-img ${small ? 'small' : ''}`} />;
  }
  return <div className={`avatar ${small ? 'small' : ''}`}>{getInitials(name)}</div>;
}

function ChatApp() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [callStatus, setCallStatus] = useState('idle');
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [incomingFrom, setIncomingFrom] = useState(null);
  const [myProfilePic, setMyProfilePic] = useState('');
  const [unreadFrom, setUnreadFrom] = useState({});

  const navigate = useNavigate();
  const username = localStorage.getItem('username');
  const myPrivateKey = localStorage.getItem(`privateKey_${username}`);
  const registeredRef = useRef(false);
  const selectedUserRef = useRef(null);
  const recipientPublicKeyRef = useRef(null);
  const fileInputRef = useRef(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!localStorage.getItem('token') || !myPrivateKey) {
      navigate('/login');
      return;
    }

    if (!registeredRef.current) {
      socket.emit('registerUser', username);
      registeredRef.current = true;
    }

    axios.get(`${API_URL}/api/auth/users/${username}`)
      .then((res) => setUsers(res.data))
      .catch((err) => console.error(err));

    axios.get(`${API_URL}/api/auth/profile/${username}`)
      .then((res) => setMyProfilePic(res.data.profilePicture || ''))
      .catch((err) => console.error(err));

    const decryptMessage = (encryptedMessage, nonce, senderPublicKey, myPrivKey) => {
      const decrypted = nacl.box.open(
        decodeBase64(encryptedMessage),
        decodeBase64(nonce),
        decodeBase64(senderPublicKey),
        decodeBase64(myPrivKey)
      );
      return encodeUTF8(decrypted);
    };

    const handleIncoming = ({ from, encryptedMessage, nonce, self, createdAt }) => {
      const current = selectedUserRef.current;

      if (self && from === username) {
        if (!current) return;
        try {
          const decrypted = decryptMessage(encryptedMessage, nonce, recipientPublicKeyRef.current, myPrivateKey);
          setMessages((prev) => [...prev, { from, text: decrypted, time: createdAt || new Date() }]);
        } catch (err) {
          console.error('Decryption failed:', err);
        }
        return;
      }

      if (!current || from !== current.username) {
        // Message from someone we're not currently viewing — mark unread
        setUnreadFrom((prev) => ({ ...prev, [from]: true }));
        return;
      }

      try {
        const decrypted = decryptMessage(encryptedMessage, nonce, recipientPublicKeyRef.current, myPrivateKey);
        setMessages((prev) => [...prev, { from, text: decrypted, time: createdAt || new Date() }]);
      } catch (err) {
        console.error('Decryption failed:', err);
      }
    };

    socket.on('receivePrivateMessage', handleIncoming);

    socket.on('incomingCall', ({ from, offer }) => {
      setIncomingFrom(from);
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
  }, [navigate, myPrivateKey, username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openChat = async (user) => {
    setSelectedUser(user);
    selectedUserRef.current = user;
    setMessages([]);
    setUnreadFrom((prev) => ({ ...prev, [user.username]: false }));

    try {
      const res = await axios.get(`${API_URL}/api/auth/publickey/${user.username}`);
      const pubKey = res.data.publicKey;
      recipientPublicKeyRef.current = pubKey;

      const historyRes = await axios.get(`${API_URL}/api/auth/messages/${username}/${user.username}`);
      const decryptedHistory = historyRes.data.map((msg) => {
        try {
          const decrypted = nacl.box.open(
            decodeBase64(msg.encryptedMessage),
            decodeBase64(msg.nonce),
            decodeBase64(pubKey),
            decodeBase64(myPrivateKey)
          );
          return { from: msg.from, text: encodeUTF8(decrypted), time: msg.createdAt };
        } catch {
          return { from: msg.from, text: '[Could not decrypt]', time: msg.createdAt };
        }
      });
      setMessages(decryptedHistory);
    } catch (err) {
      console.error(err);
    }
  };

  const backToList = () => {
    setSelectedUser(null);
    selectedUserRef.current = null;
    if (callStatus !== 'idle') endCall();
  };

  const sendMessage = () => {
    if (input.trim() === '' || !selectedUser || !recipientPublicKeyRef.current) return;
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(
      decodeUTF8(input),
      nonce,
      decodeBase64(recipientPublicKeyRef.current),
      decodeBase64(myPrivateKey)
    );
    socket.emit('sendPrivateMessage', {
      to: selectedUser.username,
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

  const handlePictureClick = () => {
    fileInputRef.current?.click();
  };

  const handlePictureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert('Please choose an image smaller than 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result;
      try {
        await axios.post(`${API_URL}/api/auth/profile-picture`, {
          username,
          profilePicture: base64Image,
        });
        setMyProfilePic(base64Image);
      } catch (err) {
        console.error(err);
        alert('Could not upload picture.');
      }
    };
    reader.readAsDataURL(file);
  };

  const createPeerConnection = (toUsername) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('iceCandidate', { to: toUsername, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch((err) => console.error('Play failed:', err));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
    };

    return pc;
  };

  const startCall = async () => {
    if (!selectedUser) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = createPeerConnection(selectedUser.username);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('callUser', { to: selectedUser.username, from: username, offer });
      setCallStatus('calling');
    } catch (err) {
      alert('Could not access microphone. Please allow microphone permission.');
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = createPeerConnection(incomingFrom);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answerCall', { to: incomingFrom, answer });
      setCallStatus('active');
    } catch (err) {
      alert('Could not access microphone. Please allow microphone permission.');
    }
  };

  const rejectCall = () => {
    setCallStatus('idle');
    setIncomingOffer(null);
    setIncomingFrom(null);
  };

  const endCall = () => {
    const to = selectedUser?.username || incomingFrom;
    if (to) socket.emit('endCall', { to });
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
    setIncomingFrom(null);
  };

  return (
    <div className="app-shell">
      <div className={`sidebar ${selectedUser ? 'hide-on-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="my-profile" onClick={handlePictureClick} title="Change profile picture">
            <Avatar name={username} picture={myProfilePic} small />
          </div>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handlePictureChange}
          />
          <div className="brand-mini">❄ Frostline</div>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
        <div className="user-list">
          {users.length === 0 && <p className="empty-hint">No other users yet.</p>}
          {users.map((u) => (
            <div
              key={u._id}
              className={`user-row ${selectedUser?.username === u.username ? 'active' : ''}`}
              onClick={() => openChat(u)}
            >
              <Avatar name={u.username} picture={u.profilePicture} />
              <div className="user-row-name">{u.username}</div>
              {unreadFrom[u.username] && <div className="unread-dot" />}
            </div>
          ))}
        </div>
      </div>

      <div className={`main-panel ${!selectedUser ? 'hide-on-mobile' : ''}`}>
        {!selectedUser && (
          <div className="empty-state">
            <p>Select a conversation to start chatting</p>
          </div>
        )}

        {selectedUser && (
          <>
            <div className="main-header">
              <button className="back-btn" onClick={backToList}>←</button>
              <Avatar name={selectedUser.username} picture={selectedUser.profilePicture} small />
              <div className="main-header-name">{selectedUser.username}</div>
              <div className="main-header-actions">
                {callStatus === 'idle' && <button onClick={startCall} className="call-btn">📞</button>}
                {(callStatus === 'calling' || callStatus === 'active') && (
                  <button onClick={endCall} className="end-call-btn">End Call</button>
                )}
              </div>
            </div>

            {callStatus === 'calling' && <p className="call-status">Calling {selectedUser.username}...</p>}
            {callStatus === 'active' && <p className="call-status">On call with {selectedUser.username}</p>}
            {callStatus === 'incoming' && (
              <div className="incoming-call-box">
                <p>{incomingFrom} is calling you...</p>
                <button onClick={acceptCall} className="call-btn">Accept</button>
                <button onClick={rejectCall} className="end-call-btn">Decline</button>
              </div>
            )}

            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            <div className="messages-scroll">
              {messages.map((msg, index) => (
                <div key={index} className={`bubble-row ${msg.from === username ? 'own' : 'other'}`}>
                  <div className="bubble">
                    <div className="bubble-text">{msg.text}</div>
                    <div className="bubble-time">{formatTime(msg.time)}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
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
          </>
        )}
      </div>
    </div>
  );
}

export default ChatApp;