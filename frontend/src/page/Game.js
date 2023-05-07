import React, { useEffect, useState } from 'react'
import {socket} from '../hooks/Socket.js'
import { useLocation } from 'react-router-dom';

export default function Game() {

  const [messages, setMessages] = useState([]);
  const [isGameEnding, setIsGameEnding] = useState(false);
  const [isGameEnding2, setIsGameEnding2] = useState(false);
  const [text, setText] = useState("");
  const location = useLocation();
  const role = location.state.role;
  const word = location.state.word;


  console.log(`Rendering with endstate 1 ${isGameEnding} and endstate 2 ${isGameEnding2}`)

  const onChatMessageResponse = (message) => {
    setMessages([...messages, message]);
  };

  const onGameEndPrepare = () => {
    console.log('Recieve end state 1');
    setIsGameEnding(true);
  }

  const onGameEndPrepare2 = () => {
    console.log('Recieve end state 2');
    setIsGameEnding2(true);
  }

  //game-ask game-answer game-guess-word game-guess-insider chat-message chat-message-response game-end-prepare
  useEffect(() => {
    socket.on('chat-message-response', onChatMessageResponse);
    socket.on('game-end-prepare', onGameEndPrepare);
    socket.on('game-end-prepare2', onGameEndPrepare2);
    return () => {
      socket.off('chat-message-response', onChatMessageResponse);
      socket.off('game-end-prepare', onGameEndPrepare);
      socket.off('game-end-prepare2', onGameEndPrepare2);
    }
  },[socket, onChatMessageResponse, onGameEndPrepare, onGameEndPrepare2]);

  const sendMessage = () => {
    socket.emit('chat-message', text);
  }

  const askQuestion = () => {
    socket.emit('game-ask', text);
  }

  const answerQuestion = (bool) => {
    socket.emit('game-answer', bool);
  }

  const guessWord = () => {
    socket.emit('game-guess-word', text);
  }

  const guessInsider = () => {
    socket.emit('game-guess-insider', text);
  }


  //Game

  return (
    <div>
      <h2>You are {role}</h2>
      {role != "commons" && <h2>The secret word is {word}</h2>}
      <div className="chat">
          {
            messages.map(message => {
              return <p>{message}</p>
            })
          }
      </div>
      <input name='text' value={text} onChange={e => setText(e.target.value)}></input>
      {role == "master" ? 
        <div>
          <button onClick={() => answerQuestion(true)}>Yes</button>
          <button onClick={() => answerQuestion(false)}>No</button>
        </div> : 
        <div>
          {isGameEnding && !isGameEnding2 && <button onClick={guessWord}>Guess Word</button>}
          {isGameEnding2 && <button onClick={guessInsider}>Guess Insider</button>}
          {!isGameEnding && <button onClick={askQuestion}>Ask</button>}
          <button onClick={sendMessage}>Send</button>
        </div>}
    </div>
  )
}
