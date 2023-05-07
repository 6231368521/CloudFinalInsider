const express = require('express');
const app = express();
const server = require('http').createServer(app);
const {Server} = require("socket.io");
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const port = process.env.PORT || 3000;
const clientName = process.env.CLIENT_NAME || "client"
const clientPort = process.env.CLIENT_PORT || 8000
const databaseName = process.env.DATABASE_NAME || "redispubsub"

// const io = new Server(server, {
//     cors: {
//         origin: [`http://${clientName}:8000`, `http://${clientName}:8001`],
//         credentials: true
//     }
// });

const io = new Server(server, {
    cors: {
        origin: [`http://${clientName}:${clientPort}`],
        credentials: true
    }
});

const pubClient = redis.createClient({ url: `redis://${databaseName}:6379` });
pubClient.on("error", (err) => console.log("Redis Client Error", err));
const subClient = pubClient.duplicate();
const queryClient = pubClient.duplicate();


Promise.all([pubClient.connect(), subClient.connect(), queryClient.connect()]).then(() => {
    console.log("Redis connected")
    io.adapter(createAdapter(pubClient, subClient));
    io.listen(3000);
});


app.get('/', (req, res) => {
    res.status(200).json("Hello express!");
});


io.on('connection', (socket) => {
    console.log('User connected ' + socket.id);

    socket.on('join-room', async (roomId, name) => {
        //Disconnect from all room first except the socket id room
        const rooms = socket.rooms;
        for (let rid of rooms) {
            if (rid == socket.id) {
                continue;
            } else {
                socket.leave(rid);
            }
        }
        if (await queryClient.get(`rooms:${roomId}:gamestate:running`) == "true") {
            socket.emit('server-msg', 'Game already running');
            return;
        }
        console.log(`User ${name} attempt to join room ${roomId}`);
        // Check if name or this id already exists
        const nameConflict = await queryClient.sIsMember(`rooms:${roomId}:playerNames`, name);
        const idConflict = await queryClient.sIsMember(`rooms:${roomId}:playerIDs`, socket.id);
        if (nameConflict || idConflict) {
            socket.emit('server-msg', `Name already taken`);
        } else {
            //Add player info to database
            await queryClient.set(`rooms:${roomId}:players:${socket.id}:name`, name);
            await queryClient.set(`rooms:${roomId}:players:${name}:id`, socket.id);
            await queryClient.sAdd(`rooms:${roomId}:playerNames`, name);
            await queryClient.sAdd(`rooms:${roomId}:playerIDs`, socket.id);
            socket.join(roomId);
            console.log('Join success');
            socket.emit('join-room-response', true);
            //Send players name to other players
            const playerNames = await queryClient.sMembers(`rooms:${roomId}:playerNames`);
            socket.to(roomId).emit('get-players-response', playerNames);
            socket.emit('get-players-response', playerNames);
        }
    });

    socket.on('get-players', async () => {
        //Should only be one room except socket id
        const rooms = socket.rooms;
        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                const playerNames = await queryClient.sMembers(`rooms:${roomId}:playerNames`);
                socket.to(roomId).emit('get-players-response', playerNames);
                socket.emit('get-players-response', playerNames);
            }
        }
    });

    socket.on('disconnecting', async () => {
        const rooms = socket.rooms;
        console.log(rooms.toString());
        console.log(`User ${socket.id} disconnected`);
        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                console.log(`${roomId} handle disconnection...`);
                const name = await queryClient.get(`rooms:${roomId}:players:${socket.id}:name`);
                await queryClient.sRem(`rooms:${roomId}:playerNames`, name);
                await queryClient.sRem(`rooms:${roomId}:playerIDs`, socket.id);
                await queryClient.del(`rooms:${roomId}:players:${socket.id}:name`);
                await queryClient.del(`rooms:${roomId}:players:${name}:id`);
                //if player in lobby room, send player names
                const playerNames = await queryClient.sMembers(`rooms:${roomId}:playerNames`)
                const isGameRunning = await queryClient.get(`rooms:${roomId}:gamestate:running`) == "true"
                if (isGameRunning) {
                    //Game already running, should not disconnect
                    socket.to(roomId).emit('chat-message-response', `${name} disconnected`);
                } else {
                    //Game is not running
                    socket.to(roomId).emit('get-players-response', playerNames);
                }
                if (playerNames.length == 0) {
                    //destroy room
                    if (isGameRunning) {
                        await queryClient.del(`rooms:${roomId}:role:master`);
                        await queryClient.del(`rooms:${roomId}:role:insider`);
                        await queryClient.del(`rooms:${roomId}:role:commons`);
                        await queryClient.del(`rooms:${roomId}:gamestate:secretword`);
                        await queryClient.del(`rooms:${roomId}:gamestate:questions-asked`);
                        await queryClient.del(`rooms:${roomId}:gamestate:questions-answered`);
                        await queryClient.del(`rooms:${roomId}:gamestate:running`);
                        await queryClient.del(`rooms:${roomId}:gamestate:insiderguess`);
                    }
                    
                }
            }
        }
    });

    socket.on('chat-message', async (message) => {
        //Should only be one room
        const rooms = socket.rooms;
        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                const name = await queryClient.get(`rooms:${roomId}:players:${socket.id}:name`);
                socket.to(roomId).emit('chat-message-response', `${name}: ${message}`);
                socket.emit('chat-message-response', `${name}: ${message}`);
            }
        }
    });

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    socket.on('game-start', async () => {
        const rooms = socket.rooms;
        console.log("Starting game...");
        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } 
            
            let numberOfPlayers = await queryClient.sCard(`rooms:${roomId}:playerIDs`);
            
            if (numberOfPlayers < 4) {
                console.log(`Number of players is ${numberOfPlayers}, required at least 4`);
                return;
            } else {
                let ids = await queryClient.sMembers(`rooms:${roomId}:playerIDs`);
                shuffleArray(ids);
                console.log("Assigning roles...");
                const masterId = ids[0];
                const insiderId = ids[1];
                const commonsIds = ids.slice(2);
                //TODO get random words
                const secretWord = await queryClient.sRandMember("words");
                io.to(masterId).emit('roles', 'master', secretWord);
                io.to(insiderId).emit('roles', 'insider', secretWord);
                for (let commonsId of commonsIds) {
                    io.to(commonsId).emit('roles', 'commons', "");
                }
                //Bandaid fix for socket.to not emit to self
                // if (masterId == socket.id) {
                //     socket.emit('roles', 'master', secretWord);
                // } else if (insiderId == socket.id) {
                //     socket.emit('roles', 'insider', secretWord);
                // } else {
                //     //is common
                //     socket.emit('roles', 'commons', "");
                // }
                console.log("Saving in database...");
                await queryClient.set(`rooms:${roomId}:role:master`, masterId);
                await queryClient.set(`rooms:${roomId}:role:insider`, insiderId);
                await queryClient.sAdd(`rooms:${roomId}:role:commons`, commonsIds);
                await queryClient.set(`rooms:${roomId}:gamestate:secretword`, secretWord);
                await queryClient.set(`rooms:${roomId}:gamestate:questions-asked`, 0);
                await queryClient.set(`rooms:${roomId}:gamestate:questions-answered`, 0);
                await queryClient.set(`rooms:${roomId}:gamestate:running`, "true");
                console.log("Room created!")
            }
        }
    });
    //TODO game-ask, game-answer-master, game-guess-word, game-guess-insider
    socket.on('game-ask', async (question) => {
        const rooms = socket.rooms;

        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                const questionAsked = parseInt(await queryClient.get(`rooms:${roomId}:gamestate:questions-asked`));
                if (questionAsked >= 20) {
                    socket.emit('chat-message-response', `Question limit reached`);
                } else {
                    //can ask
                    await queryClient.set(`rooms:${roomId}:gamestate:questions-asked`, questionAsked + 1);
                    socket.to(roomId).emit('chat-message-response', `Question ${questionAsked + 1}: ${question}`);
                    socket.emit('chat-message-response', `Question ${questionAsked + 1}: ${question}`);
                }
            }
        }
    });

    socket.on('game-answer', async (answerBool) => {
        const rooms = socket.rooms;

        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                const questionAsked = parseInt(await queryClient.get(`rooms:${roomId}:gamestate:questions-asked`));
                const questionAnswered = parseInt(await queryClient.get(`rooms:${roomId}:gamestate:questions-answered`));
                if (questionAsked <= questionAnswered) {
                    //Answer too much
                    socket.emit('chat-message-response', `You are trying to answer too much`);
                } else {
                    await queryClient.set(`rooms:${roomId}:gamestate:questions-answered`, questionAnswered + 1);
                    const answer = answerBool ? "yes" : "no";
                    socket.to(roomId).emit('chat-message-response', `Question ${questionAnswered + 1} Response: ${answer}`);
                    socket.emit('chat-message-response', `Question ${questionAnswered + 1} Response: ${answer}`);
                    if (questionAnswered + 1 >= 20) {
                        //Trigger game end
                        console.log(`Room ${roomId} preparing 1st end state...`);
                        socket.to(roomId).emit('game-end-prepare');
                        socket.emit('game-end-prepare');
                    }
                }
            }
        }
    });

    socket.on('game-guess-word', async (word) => {
        const rooms = socket.rooms;

        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                const questionAnswered = parseInt(await queryClient.get(`rooms:${roomId}:gamestate:questions-answered`));
                if (questionAnswered < 20) {
                    //not game ending yet
                    socket.emit('chat-message-response', `Game has not reached this state`);
                } else {
                    const trueWord = await queryClient.get(`rooms:${roomId}:gamestate:secretword`);
                    if (word.trim().toLowerCase() == trueWord) {
                        //correct go to guess insider
                        console.log(`Room ${roomId} preparing 2nd end state...`);
                        socket.to(roomId).emit('chat-message-response', `Guess is ${word}, the correct word is ${trueWord}, Guess the insider`);
                        socket.to(roomId).emit('game-end-prepare2');
                        socket.emit('chat-message-response', `Guess is ${word}, the correct word is ${trueWord}, Guess the insider`);
                        socket.emit('game-end-prepare2');
                        await queryClient.set(`rooms:${roomId}:gamestate:insiderguess`, "true");
                    } else {
                        console.log(`Room ${roomId} sending endings...`);
                        socket.to(roomId).emit('chat-message-response', `Guess is ${word}, the correct word is ${trueWord}, the Master wins!`);
                        socket.emit('chat-message-response', `Guess is ${word}, the correct word is ${trueWord}, the Master wins!`);
                    }
                }
            }
        }
        
    });

    socket.on('game-guess-insider', async (name) => {
        const rooms = socket.rooms;
        for (let roomId of rooms) {
            if (roomId == socket.id) {
                continue;
            } else {
                console.log(`Room ${roomId} sending endings...`);
                const isReady = await queryClient.get(`rooms:${roomId}:gamestate:insiderguess`) == "true";
                const questionAnswered = parseInt(await queryClient.get(`rooms:${roomId}:gamestate:questions-answered`));
                if (questionAnswered < 20 || !isReady) {
                    //game not end yet
                    socket.emit('chat-message-response', `Game has not reached this state`);
                } else {
                    const insiderId = await queryClient.get(`rooms:${roomId}:role:insider`);
                    const insiderName = await queryClient.get(`rooms:${roomId}:players:${insiderId}:name`);
                    if (name.trim() == insiderName) {
                        //guess correct
                        socket.to(roomId).emit('chat-message-response', `Guess is ${name}, the insider is ${insiderName}, the Commons win!`);
                        socket.emit('chat-message-response', `Guess is ${name}, the insider is ${insiderName}, the Commons win!`);
                    } else {
                        //guess wrong
                        socket.to(roomId).emit('chat-message-response', `Guess is ${name}, the insider is ${insiderName}, the Insider wins!`);
                        socket.emit('chat-message-response', `Guess is ${name}, the insider is ${insiderName}, the Insider wins!`);
                    }
                }
            }
        }
        
    });

    // const delRoom = async (roomId) => {
    //     const playerNames = await queryClient.sMembers(`rooms:${roomId}:playerNames`);
    //     const playerIDs = await queryClient.sMembers(`rooms:${roomId}:playerIDs`);
    //     for (let playerName of playerNames) {
    //         await queryClient.del(`rooms:${roomId}:players:${playerName}:id`)
    //     }
    //     for (let playerID of playerIDs) {
    //         await queryClient.del(`rooms:${roomId}:players:${playerID}:name`);
    //     }
    //     await queryClient.del(`rooms:${roomId}:playerNames`);
    //     await queryClient.del(`rooms:${roomId}:playerIDs`);
    //     await queryClient.del(`rooms:${roomId}:role:master`);
    //     await queryClient.del(`rooms:${roomId}:role:insider`);
    //     await queryClient.del(`rooms:${roomId}:role:commons`);
    //     await queryClient.del(`rooms:${roomId}:gamestate:secretword`);
    //     await queryClient.del(`rooms:${roomId}:gamestate:questions-asked`);
    //     await queryClient.del(`rooms:${roomId}:gamestate:questions-answered`);
    //     await queryClient.del(`rooms:${roomId}:gamestate:running`);
    // }
    
});