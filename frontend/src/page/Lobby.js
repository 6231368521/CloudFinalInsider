import React, { useEffect, useState} from 'react'
import { useNavigate } from 'react-router-dom';
import {socket} from '../hooks/Socket.js'

export default function Lobby() {

    const [players, setPlayers] = useState([]);

    const navigate = useNavigate();

    const onGetPlayers = (playerList) => {
        setPlayers(playerList);
    }

    const onRole = (role, word) => {
        navigate('/game', {state: {role, word}});
    }
    useEffect(() => {
        socket.on('get-players-response', onGetPlayers);
        socket.emit('get-players');
        socket.on('roles', onRole);

        return () => {
            socket.off('get-players-response', onGetPlayers);
            socket.off('roles', onRole);
        }
    }, [onGetPlayers, socket, players, onRole]);

    const startGame = () => {
        socket.emit('game-start');
    }

    return (
        <div>
            <h2>Lobby</h2>
            {
                players.map(player => {
                    return <h1>{player}</h1>
                })
            }
            <button onClick={startGame}>Start Game</button>
        </div>
    )
}
