import React, { useContext, useState, useEffect } from 'react';
import {io} from 'socket.io-client';


export const socket = io(`http://${process.env.REACT_APP_SERVER_NAME}:${process.env.REACT_APP_SERVER_PORT}`, {
    withCredentials: true,
    autoConnect: false,
    reconnection: false
});