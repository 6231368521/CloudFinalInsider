import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {socket} from '../hooks/Socket.js'

export default function JoinRoom() {
    const [name, setName] = useState('');
    const [roomID, setRoomID] = useState('');
    const navigate = useNavigate();


    const onJoinRoomResponse = (status) => {
        if (status == true) {
            console.log('MOVE')
            navigate('/lobby');
        }
    }

    useEffect(() => {
        socket.on('join-room-response', onJoinRoomResponse);
        return () => {
            socket.off('join-room-response', onJoinRoomResponse);
        }
    }, [onJoinRoomResponse, socket]);

    const onSubmit = async (e) => {
        console.log('click')
        e.preventDefault();
        if(name == '' || roomID == '') {
            return;
        } else {
            socket.emit('join-room', roomID, name);  
        }
    }
    return (
        <div>
            <form onSubmit={onSubmit}>
                <label>
                Name: <input name='name-input' value={name} onChange={e => setName(e.target.value)}></input>
                </label>
                <label>
                RoomID: <input name='room-input' value={roomID} onChange={e => setRoomID(e.target.value)}></input>
                </label>
                <button type="submit">Join Room</button>
            </form>
        </div>
    )
}
