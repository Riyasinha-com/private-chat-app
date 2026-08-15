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

  const decryptMessage = (encryptedMessage, nonce, senderPublicKey, myPrivKey) => {
    const decrypted = nacl.box.open(
      decodeBase64(encryptedMessage),
      decodeBase64(nonce),
      decodeBase64(senderPublicKey),
      decodeBase64(myPrivKey)
    );
    return encodeUTF8(decrypted);
  };

  useEffect(() => {
    if (!localStorage.getItem('token') || !myPrivateKey) {
      navigate('/login');
      return;
    }

    if (!registeredRef.current) {
      socket.emit('registerUser', username);
      registeredRef.current = true;
    }

    // Fetch recipient's public key, THEN load message history
    axios.get(`${API_URL}/api/auth/publickey/${recipientUsername}`)
      .then(async (res) => {
        const pubKey = res.data.publicKey;
        setRecipientPublicKey(pubKey);
        recipientPublicKeyRef.current = pubKey;

        // Load past messages
        try {
          const historyRes = await axios.get(`${API_URL}/api/auth/messages/${username}/${recipientUsername}`);
          const decryptedHistory = historyRes.data.map((msg) => {
            try {
              const text = decryptMessage(msg.encryptedMessage, msg.nonce, pubKey, myPrivateKey);
              return { from: msg.from, text };
            } catch {
              return { from: msg.from, text: '[Could not decrypt]' };
            }
          });
          setMessages(decryptedHistory);
        } catch (err) {
          console.error('Error loading history:', err);
        }
      })
      .catch((err) => console.error(err));

    const handleIncoming = ({ from, encryptedMessage, nonce, self }) => {
      if (from !== recipientUsername && !self) return;
      if (self && from !== username) return;
      try {
        const decrypted =