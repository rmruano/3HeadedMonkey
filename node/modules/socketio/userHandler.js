/*jslint latedef: false */
"use strict";

var crypto = require('crypto'),
    mplib = require("../mplib.js");

var socketio,
    minivega,
    socketNS,
    metricsClient,
    heapdump,
    options = {
        maxGuestConnections: 10000, // max guest connections
        maxGuestSockets: 1, // max sockets per guest connection
        maxUserConnections: 10000, // max registered user connections
        maxUserSockets: 3, // max sockets per user connection
        socketNamespace: "/user", // socketio user namespace
        printUsage: false, // Print socketio usage in server console
        lastRoom: false, // Enable user last room
        log: true
    };

var users = {};
var guests = {};
var usersConnected = {
    users: 0,
    userSockets: 0,
    guests: 0,
    guestSockets: 0
};
var roomsConnected = {
    total: 0
};

function log(message) {
    if (options.log) {
        console.log("SocketIO UserHandler: "+message);
    }
}


function error(e, userId) {
    if ('undefined' === typeof userId) {
        userId = 0;
    }
    console.log("!! SocketIO UserHandler ERROR: "+ e.message);
    console.log(e.stack);
    //minivega.logError("dev","!! SocketIO UserHandler ERROR: "+ e.message,e.stack,userId);
}

/**
 * Handle registered user connection to the server
 * @param socket
 * @param userData
 */
function handleUserConnection(socket, userData) {
    var friendUser, room, room2, found;

    if (socket.dataType !== "user") {return;} /* Not an user connection */
    if(users.hasOwnProperty(userData.userId)) {
        if(users[userData.userId].hasOwnProperty("sockets")) {
            if(users[userData.userId].sockets.length >= options.maxUserSockets) {return;} /*User reached max sockets allowed*/
        }
    }

    room = "all:page|"+userData.pageType+"|"+userData.pageTypeId;
    room2 = "user:page|"+userData.pageType+"|"+userData.pageTypeId;
    socket.join(room);
    socket.join(room2);
    socket.dataRoom = room;

    if (!users.hasOwnProperty(userData.userId)) {
        // Log user connection
        log("handleUserConnection "+userData.userId+" (first socket)");

        // Load friends and emit readiness after that
        var response={};

        var handleUserWithFriends = function(response) {
            //console.dir(response);
            // First user
            users[userData.userId] = {
                userId: userData.userId,
                userUid: userData.userUid,
                timestamp: userData.connectTimestamp,
                userName: userData.userName,
                userLevel: userData.userLevel,
                userAvatar: userData.userAvatar,
                userWeb: userData.userWeb,
                userLang: userData.userLang,
                userIsStaff: userData.userIsStaff,
                userFriends: [],
                userConnectedFriends: [],
                userShareStatus: userData.userShareStatus,
                userShareRoom: userData.userShareRoom,
                lastRoom: room,
                sockets: [socket],
                rooms: {}
            };
            users[userData.userId].rooms[room] = true;

            // Add friends (if they're provided)
            if (response && response.hasOwnProperty("item") && response.item instanceof Array) {
                users[userData.userId].userFriends = response.item;
            }

            if(options.lastRoom && users[userData.userId].userFriends.length>0) {
                // Check already connected user friends
                for(var i=0, j=users[userData.userId].userFriends.length; i<j; i+=1) {
                    // Notify friends that the user has connected
                    if (users.hasOwnProperty(users[userData.userId].userFriends[i]) && users[userData.userId].userFriends[i] !== userData.userId) {
                        // Notify the friend and add the user to the connected friends users
                        friendUser = users[users[userData.userId].userFriends[i]];
                        found = false;
                        for(var j= 0, i= friendUser.userConnectedFriends.length;j<i;j++) {
                            if (friendUser.userConnectedFriends[j]===userData.userIdfriendUser.userId) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            if(hasPermissions(friendUser.userId, userData.userId, "online-perm")) {
                                friendUser.userConnectedFriends.push(userData.userId);
                                for(var j= 0, i=friendUser.sockets.length;j<i;j+=1) {
                                    friendUser.sockets[j].volatile.emit("friend-connect",{users: getConnectedUsersDataByIds([userData.userId]), room: room});
                                }
                            }
                            if(hasPermissions(userData.userId, friendUser.userId, "online-perm")) {
                                // Add the friend to the user connected friends
                                users[userData.userId].userConnectedFriends.push(friendUser.userId);
                            }
                        }
                    }
                }
            }

            socket.emit("ready",{
                connected:true,
                guest:false,
                userId: userData.userId,
                timestamp: userData.connectTimestamp,
                userShareStatus: userData.userShareStatus,
                userShareRoom: userData.userShareRoom,
                userIsStaff: userData.userIsStaff,
                rooms: users[userData.userId].rooms,
                room: room,
                roomAllSockets: socketNS.clients(room).length,
                roomUserSockets: socketNS.clients(room2).length,
                roomGuestSockets: socketNS.clients(room).length - socketNS.clients(room2).length,
                userConnectedFriends: getConnectedUsersDataByIds(users[userData.userId].userConnectedFriends),
                userRoomConnectedFriends: getConnectedUsersDataByIds(getRoomConnectedFriends(room, userData.userId))
            });

        };

        if (minivega.isEnabled()) {
            minivega.send(handleUserWithFriends,"get-user-friends",false,[userData.userId]); // Load friends from our back-end
        } else {
            if (userData.hasOwnProperty("userFriends") && userData.userFriends instanceof Array) {
                handleUserWithFriends({item: userData.userFriends}); // hardcoded friend, simulate the response
            } else {
                handleUserWithFriends(false); // No friends
            }
        }

    } else {
        users[userData.userId].sockets.push(socket);
        users[userData.userId].rooms[room] = true;
        users[userData.userId].lastRoom = room;
        log("handleUserConnection "+userData.userId+" ("+users[userData.userId].sockets.length+" sockets)");
        // Check friends already connected to the same room
        if(options.lastRoom && users[userData.userId].userFriends.length>0) { // If last room broadcast is enabled in server config
            for(var i=0,j=users[userData.userId].userFriends.length; i<j; i+=1) {
                if (users.hasOwnProperty(users[userData.userId].userFriends[i])) {
                    friendUser = users[users[userData.userId].userFriends[i]];
                        if(hasPermissions(friendUser.userId, userData.userId, "last-room-perm")) {
                            if (friendUser.rooms.hasOwnProperty(room)) {
                                for(j=0;j<friendUser.sockets.length;j+=1) {
                                    // Only notify the socket if it's the same room
                                    if (friendUser.sockets[j].dataRoom === room) {
                                        friendUser.sockets[j].volatile.emit("friend-connect-room",{users: getConnectedUsersDataByIds([userData.userId]), room: room});
                                    }
                                }
                            }
                            // Notify every friends of the room change
                                for(j=0;j<friendUser.sockets.length;j+=1) {
                                    // Only notify the socket if it's not the room
                                    if (friendUser.sockets[j].dataRoom !== room) {
                                        friendUser.sockets[j].volatile.emit("friend-last-room",{users: getConnectedUsersDataByIds([userData.userId]), room: room});
                                    }
                                }
                        }
                }
            }
        }
        socket.emit("ready",{
            connected:true,
            guest:false,
            userId: userData.userId,
            timestamp: userData.connectTimestamp,
            userShareStatus: userData.userShareStatus,
            userShareRoom: userData.userShareRoom,
            userIsStaff: userData.userIsStaff,
            rooms: users[userData.userId].rooms,
            room: room,
            roomAllSockets: socketNS.clients(room).length,
            roomUserSockets: socketNS.clients(room2).length,
            roomGuestSockets: socketNS.clients(room).length - socketNS.clients(room2).length,
            userConnectedFriends: getConnectedUsersDataByIds(users[userData.userId].userConnectedFriends),
            userRoomConnectedFriends: getConnectedUsersDataByIds(getRoomConnectedFriends(room, userData.userId))
        });
    }
}

/**
 * Get all friends connected to a room
 * @param room
 * @param userId
 * @returns {Array}
 */
function getRoomConnectedFriends(room, userId) {
    var connectedFriends = [], friendUser, i;
    if (!users.hasOwnProperty(userId)) {
        return connectedFriends;
    }
    for(var i= 0,j=users[userId].userFriends.length; i<j; i+=1) {
        if (users.hasOwnProperty(users[userId].userFriends[i])) {
            friendUser = users[users[userId].userFriends[i]];
            if(hasPermissions(friendUser.userId, userId, "last-room-perm")) {
                if (friendUser.rooms.hasOwnProperty(room)) {
                    connectedFriends.push(friendUser.userId);
                }
            }
        }
    }
    return connectedFriends;
}

/**
 * Get the user data of a conected user by his ID
 * @param id
 * @param userIds
 * @returns {Array}
 */
function getConnectedUsersDataByIds(userIds) {
    var i,
        usersData = [],
        user;
        //requesterUserPermissions = getUserPermissions();

    if (!userIds instanceof Array) {
        return usersData;
    }
    for(var i= 0, j=userIds.length; i<j; i+=1) {
        if (users.hasOwnProperty(userIds[i])) {
            // Get friend permissions
            //var friendUserPermissions = getUserPermissions(userIds[i]);
            // If user has status permission enabled or requester is staff
            //if (friendUserPermissions.userShareStatus || requesterUserPermissions.userIsStaff == "1") {
                user = users[userIds[i]];
                usersData.push({
                    userId: user.userId,
                    userUid: user.userUid,
                    userName: user.userName,
                    userLevel: user.userLevel,
                    userAvatar: user.userAvatar,
                    userWeb: user.userWeb,
                    userLang: user.userLang,
                    userIsStaff: user.userIsStaff,
                    lastRoom: filterUserLastRoom(user.lastRoom)
                });
            //}
        }
    }
    return usersData;
}


/**
 * Check if a friend of a user has permissions to recieve broadcast of his last room and connection
 * @param whoId
 * @param friendId
 * @param permission
 * @returns {boolean}
 */
function hasPermissions(whoId,friendId, permission) {
    var whoPermissions = getUserPermissions(whoId);
    var friendPermissions = getUserPermissions(friendId);

    if(whoPermissions.staff) {
        return true;
    } else {
        if(friendPermissions.staff) {
            return false;
        } else {
            if(permission == "online-perm") {
                if(whoPermissions.shareStatus) {
                    if(friendPermissions.shareStatus) {
                        return true;
                    }
                }
            } else if(permission == "last-room-perm") {
                if(whoPermissions.shareRoom) {
                    if(friendPermissions.shareRoom) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

/**
 * Get the permissions of a specified user
 * @param userId
 * @returns {*}
 */
function getUserPermissions(userId) {
    if (!users.hasOwnProperty(userId)) {
        return false;
    } else {
        var userShareStatus = users[userId].userShareStatus,
            userShareRoom = users[userId].userShareRoom,
            userIsStaff = users[userId].userIsStaff;
            userIsStaff = userIsStaff == "1" ? true : false;

        return {staff: userIsStaff, shareStatus: userShareStatus, shareRoom: userShareRoom};
    }
}

/**
 * Handles registered user disconnection
 * @param socket
 * @param userId
 */
function handleUserDisconnection(socket, userId) {
    var i, j, friendUser;
    if (socket.dataType !== "user") return; /* Not an user connection */
    if (users.hasOwnProperty(userId)) {
        //log("handleUserDisconnection "+userId+" ("+users[userId].sockets.length+" sockets)");
        for(i=0;i<users[userId].sockets.length;i+=1) {
            if (users[userId].sockets[i].id===socket.id) {
                users[userId].sockets.splice(i, 1); // Remove element from array
                break;
            }
        }
        //log("handleUserDisconnection "+userId+" ("+users[userId].sockets.length+" sockets remaining)");
        // Notify friends on the same room the user has disconnected
        if (users[userId].rooms.hasOwnProperty(socket.dataRoom)) {
            delete users[userId].rooms[socket.dataRoom];
            for(i=0; i<users[userId].userFriends.length; i+=1) {
                if (users.hasOwnProperty(users[userId].userFriends[i])) {
                    friendUser = users[users[userId].userFriends[i]];
                    if (friendUser.rooms.hasOwnProperty(socket.dataRoom)) {
                        for(j=0;j<friendUser.sockets.length;j+=1) {
                            if (friendUser.sockets[j].dataRoom === socket.dataRoom) {
                                friendUser.sockets[j].volatile.emit("friend-disconnect-room",{users: [userId],room: socket.dataRoom});
                            }
                        }
                    }
                }
            }
        }
        if (users[userId].sockets.length<=0) {
            // Delay the total disconnection to prevent disconnecting an user who is just going from one page to another.
            setTimeout(function() {
                handleUserTotalDisconnection(userId);
            },15000);
        }
    }
}


/**
 * Handles the last user connection, if the user don't have any other session kill him and nitify his friends that he has disconnected.
 * @param userId
 */
function handleUserTotalDisconnection(userId) {
    var friendUser, i, j;
    if (users.hasOwnProperty(userId) && users[userId].sockets.length<=0) {
        // Last, total disconnection
        log("handleUserTotalDisconnection "+userId);
        // Remove presence as friends arrays
        for(i=0; i<users[userId].userFriends.length; i+=1) {
            if (users.hasOwnProperty(users[userId].userFriends[i])) {
                friendUser = users[users[userId].userFriends[i]];
                // Remove
                for(j=0;j<friendUser.userConnectedFriends;j+=1) {
                    if (userId===friendUser.userConnectedFriends[j]) {
                        friendUser.userConnectedFriends.splice(j,1);
                    }
                }
                for(j=0;j<friendUser.sockets.length;j+=1) {
                    friendUser.sockets[j].volatile.emit("friend-disconnect",{users: [userId]});
                }
            }
        }
        // Remove user
        delete users[userId];

    }
}


/**
 * Handles a guest user connection to the socket.io server
 * @param socket
 * @param userData
 */
function handleGuestConnection(socket, userData) {
    var room, room2;
    if (socket.dataType !== "user") {return;} /* Not an user connection */
    room = "all:page|"+userData.pageType+"|"+userData.pageTypeId;
    room2 = "guest:page|"+userData.pageType+"|"+userData.pageTypeId;
    socket.join(room);
    socket.join(room2);
    if (!guests.hasOwnProperty(userData.userId)) {
        log("handleGuestConnection "+userData.userId+" (first socket)");
        // First user
        guests[userData.userId] = {
            userId: userData.userId,
            userWeb: userData.userWeb,
            userLang: userData.userLang,
            lastRoom: room,
            sockets: [socket]
        };
        socket.emit("ready",{
            connected:true,
            guest:true,
            userId: userData.userId,
            room: room,
            roomAllSockets: socketNS.clients(room).length,
            roomUserSockets: socketNS.clients(room).length - socketNS.clients(room2).length,
            roomGuestSockets: socketNS.clients(room2).length
        });
    } else {
        guests[userData.userId].sockets.push(socket);
        guests[userData.userId].lastRoom = room;
        log("handleGuestConnection "+userData.userId+" ("+guests[userData.userId].sockets.length+" sockets)");
        socket.emit("ready",{
            connected:true,
            guest:true,
            userId: userData.userId,
            room: room,
            roomAllSockets: socketNS.clients(room).length,
            roomUserSockets: socketNS.clients(room).length - socketNS.clients(room2).length,
            roomGuestSockets: socketNS.clients(room2).length
        });

    }
}


/**
 * Handles a guest user disconnection to the socket.io server
 * @param socket
 * @param userId
 */
function handleGuestDisconnection(socket, userId) {
    var i;
    if (socket.dataType !== "user") {return;} /* Not an user connection */
    if (guests.hasOwnProperty(userId)) {
        //log("handleUserDisconnection "+userId+" ("+users[userId].sockets.length+" sockets)");
        for(i=0;i<guests[userId].sockets.length;i+=1) {
            if (guests[userId].sockets[i].id===socket.id) {
                guests[userId].sockets.splice(i, 1); // Remove element from array
                break;
            }
        }
        log("handleGuestDisconnection "+userId+" ("+guests[userId].sockets.length+" sockets remaining)");
        if (guests[userId].sockets.length<=0) {
            // Last, total disconnection
            log("handleGuestTotalDisconnection "+userId);
            delete guests[userId];
        }
    }
}


function filterUserLastRoom(lastRoom) {
    var room = lastRoom.split("|"),
        where,
        page,
        gameIsDevel = 1;

    where = room[1];
    page = room[2];
    if(room[3] !== undefined) gameIsDevel = room[3];

    if(where == "tag" || where == "landing") { // Landings, category pages,....
        return {type: "other", message: "Surfing Minijuegos..."};
    }else if(where == "game" && gameIsDevel == 0){ // Game under development
        return {type: "other", message: "Surfing Minijuegos..."};
    }else if(where =="game") { // Production game
        return {type: "game", message: page};
    }else if(where =="avatars") { // Production game
        return {type: "avatars", message: "Playing around with his avatar!"};
    }else if(where =="community") { // Production game
        return {type: "community", message: "in community"};
    }else { // Page unknown
        return {type: "other", message: "Surfing Minijuegos"};
    }
}

/**
 * Connection method, each time a user connect's to socket.io this method is triggered.
 * @param socket
 */
function onConnection(socket) {
    log("User connected");

    socket.on("disconnect", function(){
        if (socket.hasOwnProperty("dataType")) {
            if (socket.dataType==="user") {
                if (socket.dataGuest) {
                    handleGuestDisconnection(socket, socket.dataUserId);
                } else {
                    handleUserDisconnection(socket, socket.dataUserId);
                }
                log("User disconnected");
            }
            if (socket.dataType==="server") {
                log("Server disconnected");
            }
        }
    });

    socket.on("user-get-status",function(data,callback) {
       var user;
       if (socket.dataType !== "user") {
           callback( false ); /* Not an user socket */
       }
       if (socket.dataGuest) {
           if (users.hasOwnProperty(socket.dataUserId)) {
               user = guests[socket.dataUserId];
               callback( {
                   guest: true,
                   userId: user.userId,
                   sockets: user.sockets.length
               } );
           } else {
               callback( false );
           }
       } else {
           if (users.hasOwnProperty(socket.dataUserId)) {
                user = users[socket.dataUserId];
                callback( {
                    guest: false,
                    userId: user.userId,
                    userUid: user.userUid,
                    userAvatar: user.userAvatar,
                    userLang: user.userLang,
                    userWeb: user.userWeb,
                    userName: user.userName,
                    userLevel: user.userLevel,
                    userIsStaff: user.userIsStaff,
                    userFriends: user.userFriends,
                    userConnectedFriends: user.userConnectedFriends,
                    userRoom: socket.dataRoom,
                    userRoomConnectedFriends: getRoomConnectedFriends(socket.dataRoom,socket.dataUserId),
                    lastRoom: user.lastRoom,
                    rooms: user.rooms,
                    sockets: user.sockets.length
                } );
           } else {
                callback( false );
           }
       }
    });

    socket.on("user-get-friends-connected",function(data,callback) {
        if (socket.dataType !== "user" || socket.dataGuest) {
            callback( false );
        } else {
            if (users.hasOwnProperty(socket.dataUserId)) {
                callback( getConnectedUsersDataByIds(users[socket.dataUserId].userConnectedFriends));
            } else {
                callback( false );
            }
        }
    });

    socket.on("user-get-friends-connected-room",function(data,callback) {
        if (socket.dataType !== "user" || socket.dataGuest) {
            callback( false );
        } else {
            if (data === false) {
                data = socket.dataRoom; /* current room */
            }
            if (users.hasOwnProperty(socket.dataUserId)) {
                callback( getConnectedUsersDataByIds(getRoomConnectedFriends(data, socket.dataUserId)) );

            } else {
                callback( false );
            }
        }
    });

    socket.on("get-are-online",getAreOnline);

    socket.on("get-rooms-stats",getRoomsStats);

    socket.on("get-stats",getStats);

    socket.on("get-all-rooms-stats",getAllRoomsStats);

    // User clients need to send a "init" message to identify themselves...
    socket.once("user-init", function(userData) {
        log("User init");
        try {

            if (userData === undefined || typeof userData !== "object" || !userData.hasOwnProperty("userId") || userData.userId.length<1 || !userData.hasOwnProperty("guest")) {
                throw new Error("Invalid data received",userData.userId);
            }
            if (!userData.guest) {
                // Validate MD5 hash
                var hash = crypto.createHash('md5').update( "miniplayrocks" + userData.userIsStaff + userData.userId + userData.userAvatar + userData.userUid + userData.userName, "utf8" ).digest('hex');
                if (hash!==userData.hash) {
                    throw new Error("Invalid user hash received");

                }
            }

            socket.dataType = "user";
            socket.dataIsReady = true;
            socket.dataGuest = userData.guest;
            socket.dataUserId = userData.userId;
            if (userData.guest) {
                if(usersConnected.guests < options.maxGuestConnections) {handleGuestConnection(socket, userData);}
            } else {
                if(usersConnected.users < options.maxUserConnections) {handleUserConnection(socket, userData);}
            }
        } catch (e) {
            error(e);
            socket.emit("ready",{connected:false, error: e.message});
            socket.disconnect();
        }
    });

    // Server clients need to send a "init" message...
    socket.once("init-server", function(serverData) {
        log("Server init");
        try {
            //console.dir(userData);
            if (serverData === undefined || typeof serverData !== "object" || !serverData.hasOwnProperty("passwd") || serverData.passwd!=="miniplayrocks") {
                throw new Error("Invalid data received or access forbidden");
            }
            socket.dataType = "server";
            socket.dataIsReady = true;
        } catch (e) {
            error(e);
            socket.emit("ready",{connected:false, error: e.message});
            socket.disconnect();
        }
    });
}

/**
 * Get the number of users connected to each room sent on data. Used on social games to know the number of users playing a game.
 * @param data
 * @param callback
 */
function getRoomsStats(data,callback) {
    var i, stats = {};
    if (data instanceof Array) {
        for(i=0;i<data.length;i+=1) {
            stats[data[i]] = socketNS.clients(data[i]).length;
        }
    }
    callback( stats );
}

/**
 * get the number of users conected for each of all rooms.
 * @param data
 * @param callback
 */
function getAllRoomsStats(data,callback) {
    var roomKey, roomName, stats = {};
    var socketNamespaceHash = options.socketNamespace+"/";
    var socketNamespaceLength = socketNamespaceHash.length;
    //console.dir(socketNS.manager);
    for (roomKey in socketNS.adapter.rooms) {
        if (socketNS.adapter.rooms.hasOwnProperty(roomKey)) {
            if (roomKey.substr(0,socketNamespaceLength) === socketNamespaceHash) {
                roomName = roomKey.substr(socketNamespaceLength);
                if (roomName.substr(0,1)==="/") {
                    roomName = roomName.substr(1); /* remove leading / */
                }
                stats[roomName] = socketNS.adapter.rooms[roomKey].length;
            }
        }
    }
    callback( stats );
}


/**
 * Get All online users and his last room
 * @param userIds
 * @param callback
 */
function getAreOnline(userIds,callback) {
    var i, usersStatus = {}, user;
    for (i=0;i<userIds.length;i+=1) {
        user = getUser(userIds[i]);
        if (user) {
            usersStatus[userIds[i]] = user.lastRoom;
        } else {
            usersStatus[userIds[i]] = false;
        }
    }
    callback( usersStatus );
}

/**
 * Get the nomber of users connected on each room
 * @param data
 * @param callback
 */
function getStats(data,callback) {
    var i, roomKey, stats = {
        users: 0,
        guests: 0,
        sockets: 0,
        userSockets: 0,
        guestSockets: 0,
        rooms: 0
    };
    var socketNamespaceHash = options.socketNamespace+"/";
    var socketNamespaceLength = socketNamespaceHash.length;
    debugger;
    for (roomKey in socketNS.adapter.rooms) {
        if (socketNS.adapter.rooms.hasOwnProperty(roomKey)) {
            if (roomKey.substr(0,socketNamespaceLength) === socketNamespaceHash) {
                stats.rooms += 1;
            }
        }
    }
    for(i in users) {
        stats.users += 1;
        stats.sockets += users[i].sockets.length;
        stats.userSockets += users[i].sockets.length;
    }
    for(i in guests) {
        stats.guests += 1;
        stats.sockets += guests[i].sockets.length;
        stats.guestSockets += guests[i].sockets.length;
    }

    callback( stats );
}

/**
 * Get all info of a user connected to the server
 * @param userId
 * @returns {*}
 */
function getUser(userId) {
    if (!users.hasOwnProperty(userId)) {
        return false;
    } else {
        return users[userId];
    }
}
/**
 * Broadcast room stats to all users connected to that room
 */
function broadcastRoomStats() {
    var roomKey,
        roomName,
        stats = {};

    var socketNamespaceHash = options.socketNamespace,
        socketNamespaceLength = socketNamespaceHash.length;

    for (roomKey in socketNS.adapter.rooms) {
        if (socketNS.adapter.rooms.hasOwnProperty(roomKey)) {
            if (roomKey.substr(0,socketNamespaceLength) === socketNamespaceHash) {
                roomName = roomKey.substr(socketNamespaceLength);
                if (roomName.substr(0,1)==="/") {
                    roomName = roomName.substr(1); /* remove leading / */
                }
                // User room ---------------------
                if (roomName.substr(0,13)==="all:page|game" || roomName.substr(0,16)==="all:page|landing") {
                    stats = {
                        room: roomName,
                        allSockets:  socketNS.clients(roomName).length,
                        userSockets:  socketNS.clients(roomName.split("all:").join("user:")).length,
                        guestSockets: socketNS.clients(roomName.split("all:").join("guest:")).length
                    };
                    socketNS.in(roomName).volatile.emit('room-stats', stats);
                }
            }
        }
    }
}

/**
 * Current usage log (server)
 */
function printUsage() {
    if(options.printUsage) {
        getStats(false,function(stats) {
            console.log("SocketIO UserHandler current usage: "+stats.sockets+" sockets | "+stats.rooms+" rooms | "+stats.guests+" guests | "+stats.users+" users");
        });
    }
}

/**
 * Get server usage stats + report them to graphite
 */
function getServerStats() {
    getStats(false,function(stats) {
        // Connections
        usersConnected.users = stats.users;
        usersConnected.guests = stats.guests;
        // Sockets
        usersConnected.userSockets = stats.userSockets;
        usersConnected.guestSockets = stats.guestSockets;
        // Rooms
        roomsConnected.total = stats.rooms;

        if (metricsClient) {
            // Connections
            metricsClient.increment('miniplay.threeheadedmonkey.sockets.unique.users', usersConnected.users * 3);
            metricsClient.increment('miniplay.threeheadedmonkey.sockets.unique.guest', usersConnected.guests * 3);
            // Sockets
            metricsClient.increment('miniplay.threeheadedmonkey.sockets.all.users', usersConnected.userSockets * 3);
            metricsClient.increment('miniplay.threeheadedmonkey.sockets.all.guest', usersConnected.guestSockets * 3);
            // Rooms
            metricsClient.increment('miniplay.threeheadedmonkey.rooms.active', usersConnected.rooms);
        }
        console.log("SocketIO UserHandler current usage: "+stats.sockets+" total sckets | "+usersConnected.userSockets+" user socket | "+usersConnected.guestSockets+" guest sockets | "+roomsConnected.total+" rooms | "+usersConnected.guests+" guests | "+usersConnected.users+" users");

    });
}

/**
 * Report users object to logger (debug)
 */
function getServerUsersStats() {
    function censor(censor) {
        var i = 0;
        return function(key, value) {
            if(i !== 0 && typeof(censor) === 'object' && typeof(value) == 'object' && censor == value)
                return '[Circular]';
            if(i >= 29) // seems to be a harded maximum of 30 serialized objects?
                return '[Unknown]';
            ++i; // so we know we aren't using the original object anymore
            return value;
        }
    }
    minivega.logInfo(options.environment, "3 Headed monkey Users ", JSON.stringify(users, censor(users)),0);
}

/**
 * Method used to destroy all user sessions with more than 120 minutes
 */
function destroyIdleUsers() {
    var nowTime = new Date(),
        minutes = 120;

    for(var user in users) {
        if(users.hasOwnProperty(user)) {
            var userTime = new Date(users[user].timestamp * 1000);
            var diffMs = (nowTime - userTime);
            var diffMins = Math.floor((diffMs/1000)/60);
            if (diffMins >= minutes) {
                handleUserTotalDisconnection(users[user].userId);
            }
        }
    }
}

/**
 * Server init
 * @param currentSocketIo
 * @param currentMinivega
 * @param customOptions
 */
function init(currentSocketIo, currentMinivega, currentMetricsClient, currentHeapdump, customOptions) {
    socketio = currentSocketIo;
    minivega = currentMinivega;
    metricsClient = currentMetricsClient;
    heapdump = currentHeapdump;

    if (customOptions !== undefined) {
        options = mplib.extend(options, customOptions);
    }

    // Socket bindings -------------
    socketNS = socketio.of(options.socketNamespace);
    socketNS.on("connection", onConnection);

    if (options.productionMode) {
        setInterval(broadcastRoomStats,30000);
        setInterval(getServerStats,3000);
        setInterval(getServerUsersStats,3600000); // Every hour report (debug) user data
        setInterval(destroyIdleUsers,60000 * 15); // every 15 minutes!
        // Snapshot report
        var nextMBThreshold = 0;
        setInterval(function () {
            var memMB = process.memoryUsage().rss / 1048576;
            if (memMB >= nextMBThreshold) {
                heapdump.writeSnapshot();
                nextMBThreshold += 100;
            }
        }, 6000 * 2);
    } else {
        setInterval(broadcastRoomStats,5000);
    }

    if (options.printUsage) {
        //setInterval(printUsage,10000);
    }
}


function getOptions() {return options;}
function getUsers() {return users;}

function setOption(optionKey, optionValue) {
    options[optionKey] = optionValue;
}

module.exports.init = init;
module.exports.getStats = getStats;
module.exports.setOption = setOption;
module.exports.getOptions = getOptions;
module.exports.getUsers = getUsers;
module.exports.getRoomStats = getRoomsStats;