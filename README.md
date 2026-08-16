# ❄ Frostline — Private, Encrypted Chat & Voice App

A full-stack real-time messaging app built with privacy as the core design principle. Messages are secured with genuine end-to-end encryption (public/private key cryptography) — not even the server can read them. Includes 1-on-1 encrypted text chat and peer-to-peer voice calling.

**🔗 Live Demo:** [https://private-chat-app-ten.vercel.app](https://private-chat-app-ten.vercel.app)

> Note: the backend runs on a free hosting tier and may take 30–60 seconds to "wake up" on the first request after inactivity.

## Features

- 🔐 **End-to-end encryption** — each user generates a public/private key pair on signup (via TweetNaCl / NaCl cryptography). Messages are encrypted on the sender's device and only decrypted on the recipient's device.
- 💬 **Real-time 1-on-1 messaging** — powered by Socket.IO, with persisted, encrypted chat history stored in MongoDB.
- 📞 **Voice calling** — peer-to-peer audio via WebRTC, with STUN/TURN servers for reliable connections across different networks.
- 🔑 **Secure authentication** — passwords hashed with bcrypt, sessions managed with JWT.
- ❄ **Custom UI** — a dark, atmospheric "winter night" theme with animated snowfall and sparkles, built from scratch.

## Tech Stack

**Frontend:** React (Vite), React Router, Axios, TweetNaCl.js, WebRTC
**Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT, bcrypt
**Deployment:** Vercel (frontend), Render (backend), MongoDB Atlas (database)

## How the Encryption Works

1. On signup, the browser generates a public/private key pair locally (via `nacl.box.keyPair()`).
2. The **public key** is sent to the server and stored alongside the user's account.
3. The **private key** never leaves the user's device — it's stored only in local browser storage.
4. To send a message, the sender encrypts it using their own private key + the recipient's public key.
5. The server relays and stores only the encrypted ciphertext — it has no way to read the message contents.
6. The recipient decrypts the message using their private key + the sender's public key.

This means even a full database breach would expose only encrypted, unreadable message data.

## Architecture