import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function UserList() {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();
  const username = localStorage.getItem('username');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }

    axios.get(`http://localhost:5000/api/auth/users/${username}`)
      .then((res) => setUsers(res.data))
      .catch((err) => console.error(err));
  }, [username, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <div className="auth-container">
      <div className="chat-header">
        <h1>Chats</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>
      {users.length === 0 && <p>No other users yet. Ask a friend to sign up!</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {users.map((user) => (
          <li key={user._id}>
            <button
              onClick={() => navigate(`/chat/${user.username}`)}
              style={{ width: '100%', marginBottom: '8px' }}
            >
              {user.username}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UserList;