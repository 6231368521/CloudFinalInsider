import JoinRoom from './page/JoinRoom.js';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Lobby from './page/Lobby.js';
import SocketProvider from './hooks/SocketProvider.js';
import Game from './page/Game.js';

function App() {

  return (
    <div className="App">
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<JoinRoom />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/game" element={<Game />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </div>
  );
}

export default App;
