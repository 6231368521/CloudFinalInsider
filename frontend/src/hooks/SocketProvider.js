import React, { useContext, useState, useEffect } from 'react';
import {io} from 'socket.io-client';
import {socket} from './Socket.js';

const SocketContext = React.createContext();

export const useSocket = () => {
    return useContext(SocketContext);
}

export default function SocketProvider({children}) {

    useEffect(() => {
        const onConnect = () => {
            console.log('User connected ' + socket.id);
        };
        
        const receiveServerMsg = (text) => {
            console.log(text);
        };
        socket.on('connect', onConnect);
        socket.on('server-msg', receiveServerMsg);
        socket.connect();

        return () => {
            socket.off('connect', onConnect);
            socket.off('server-msg', receiveServerMsg);
            socket.close();
        };
    }, []);

    // useEffect(() => {
    //     socket.on('connect', onConnect);
    //     socket.on('server-msg', receiveServerMsg);

    //     return () => {
    //         socket.off('connect', onConnect);
    //         socket.off('server-msg', receiveServerMsg);
    //     }
    // }, [socket]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    )
}
