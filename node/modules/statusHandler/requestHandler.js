var os = require('os');
var usage = require('usage');
var json,
    userHandlerStats,
    userHandler,
    cpuUsage = 0;

/**
 * Node server status & socketio status
 * @param currentUserHandler
 * @param parameters
 * @returns {{status: string, code: number, message: string, data: {socketio_status: *, threeheadmonkey_config: (b.options|*|!Object.<string, *>|topLevel.options|svc.options|method.options), server_ram_usage: number, server_loadavg: *, server_ip: (address|*|Manager.handshakeData.address|vendor.address)}}}
 */
function status(currentUserHandler, parameters) {
    userHandler = currentUserHandler;


    usage.lookup(process.pid, function(err, result) {
        cpuUsage = result;
        //console.log(result);
    });

    userHandler.getStats(false,function(stats) {
        userHandlerStats = {sockets: stats.sockets, rooms: stats.rooms, guests: stats.guests, users: stats.users};
    });

    json = {
        status: "OK",
        code: 200,
        message: "Three headed monkey status",
        data : {
            config: {
                threeheadmonkey_config: userHandler.getOptions()
            },
            server: {
                socketio_status: userHandlerStats,
                server_ram_usage: (os.totalmem() - os.freemem()),
                server_load_avg: os.loadavg(),
                server_node_usage:  cpuUsage,
                server_ip: os.networkInterfaces().eth0[0].address
            }
        }
    };
    return json;
}

/**
 * userHandler Config getter
 * @returns {b.options|*|!Object.<string, *>|topLevel.options|svc.options|method.options}
 */
function config(currentUserHandler, parameters) {
    userHandler = currentUserHandler;
    json = {
        status: "OK",
        code: 200,
        message: "Three headed monkey config",
        config: {
            userHandler: userHandler.getOptions()
        }
    };
    return json;
}

function putUserHandlerConfig(currentUserHandler, parameters) {
    userHandler = currentUserHandler;
    if(!isNaN(parameters.maxuserconnetions)) {
        userHandler.setOption("maxUserConnections", parseInt(parameters.maxuserconnetions));
    }
    if(!isNaN(parameters.maxguestconnections)) {
        userHandler.setOption("maxGuestConnections", parseInt(parameters.maxguestconnections));
    }
    if(!isNaN(parameters.maxusersockets)) {
        userHandler.setOption("maxUserSockets", parseInt(parameters.maxusersockets));
    }
    if(!isNaN(parameters.maxguestsockets)) {
        userHandler.setOption("maxGuestSockets", parseInt(parameters.maxguestsockets));
    }
    if(!isNaN(parameters.printusage)) {
        if(parameters.printusage== "1") {
            userHandler.setOption("printUsage", true);
        }else if (parameters.printusage == "0") {
            userHandler.setOption("printUsage", false);
        }
    }
    if(!isNaN(parameters.lastroom)) {
        if(parameters.lastroom == "1") {
            userHandler.setOption("lastRoom", true);
        }else if (parameters.lastroom == "0") {
            userHandler.setOption("lastRoom", false);
        }
    }

    json = {
        status: "OK",
        code: 200,
        message: "Three headed monkey config updated!",
        parameters: parameters,
        config: {
            userHandler: userHandler.getOptions()
        }
    };
    return json;
}

function printUsers(currentUserHandler) {
    userHandler = currentUserHandler;

    var onlineUsers = userHandler.getUsers(),
        onlineUser,
        finalUsers = {};

    for(onlineUser in onlineUsers) {
        finalUsers[onlineUser] = onlineUsers[onlineUser].userUid;
    }

    json = {
        status: "OK",
        code: 200,
        message: "Users Connected",
        data: finalUsers
    };
    return json;
}

function printCountUsers(currentUserHandler) {
    userHandler = currentUserHandler;

    var onlineUsers = userHandler.getUsers(),
        onlineUser,
        finalUsers = {};

    for(onlineUser in onlineUsers) {
        finalUsers[onlineUser] = onlineUsers[onlineUser].userUid;
    }

    json = {
        status: "OK",
        code: 200,
        message: "Users Connected",
        data: finalUsers.length
    };
    return json;
}

exports.status = status;
exports.config = config;
exports.printUsers = printUsers;
exports.printCountUsers = printCountUsers;
exports.putUserHandlerConfig = putUserHandlerConfig;