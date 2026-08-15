import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import UserList from './pages/UserList';
import Chat from './pages/Chat';
import SnowBackground from './components/SnowBackground';
import './App.css';

function App() {
  const isLoggedIn = !!localStorage.getItem('token');

  return (
    <BrowserRouter>
      <SnowBackground />
      <Routes>
        <Route path="/login" element={isLoggedIn ? <Navigate to="/chats" /> : <Login />} />
        <Route path="/signup" element={isLoggedIn ? <Navigate to="/chats" /> : <Signup />} />
        <Route path="/chats" element={<UserList />} />
        <Route path="/chat/:recipientUsername" element={<Chat />} />
        <Route path="*" element={<Navigate to={isLoggedIn ? "/chats" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;