"use strict";

var ByteBuffer = require("bytebuffer");
var ProtoBuf = require("protobufjs");
var fs = require('fs');
var net = require('net');
var mplib = require("./mplib.js");
var os = require('os');

/* Configuration */
var host = "localhost";
var port = 40001;
var options = {
    log: false,
    retries: 3,
    loggerType: "3HMK"
};

var metricsClient;
var isServiceEnabled=true;

/**
 * How to send a demo message:
    minivega.send(function(response) {
        console.dir(response);
    },"prueba",["a","b","c"]);
 */

/* Protobuf ================= */
/*
     message Nodejs {
         message GetRequest {
             required string type = 1;
             repeated string payloadString = 2;
             repeated int32 payloadInt = 3;
             repeated int64 payloadLong = 4;
             repeated bool payloadBool = 5;
         }
     }
 */

var builder = ProtoBuf.protoFromFile("./modules/Protocol.proto"); // Load .proto file
// console.dir(builder); /* Outputs all the message types */
var Message = builder.build("common.Nodejs.GetRequest"); // Build the Message namespace
var Envelope = builder.build("common.Envelope");

function log(message) {
    if (options.log) {
        console.log("Minivega: "+message);
    }
}

function error(message) {
    console.log("Minivega ERROR: "+message);
}

function send(callback, type, payloadString, payloadInt, payloadLong, payloadBool) {
    var msg, bytesWritten;
    if (callback === undefined || typeof callback !=="function") {
        error("Callback required");
        return false;
    }
    if (type === undefined || typeof type !=="string") {
        error("Type required");
        return false;
    }
    //log("Send "+type+" message");
    // Create a new Message ----------------------
    msg = new Message();
    msg.type = type;
    if (payloadString!==undefined && payloadString instanceof Array) {
        msg.payloadString = payloadString;
    }
    if (payloadInt!==undefined && payloadInt instanceof Array) {
        msg.payloadInt = payloadInt;
    }
    if (payloadLong!==undefined && payloadLong instanceof Array) {
        msg.payloadLong = payloadLong;
    }
    if (payloadBool!==undefined && payloadBool instanceof Array) {
        msg.payloadBool = payloadBool;
    }
    // Submit message -----------------
    bytesWritten = submit(callback, msg);
    return bytesWritten;
}

function submit(callback, msg) {

    if(metricsClient) {metricsClient.increment('miniplay.threeheadedmonkey.minivega.requests',1,0.1);}

    // Define envelope ----------------------------
    var envelope = new Envelope();
    envelope.protobufType = Envelope.Type.Nodejs_GetRequest;
    envelope.protobufData = msg.encode();

    /* Encode message */
    var encodedMessage = envelope.encode();

    // Prepend the message size so minivega can detect it
    var bb = new ByteBuffer();
    bb.writeInt(encodedMessage.length);
    bb.append(encodedMessage);

    // Send message
    var client = new net.Socket();
    try {
        client.connect(port, host, function() {
            log("<<< Writing message: "+msg.type+" ("+encodedMessage.length+"b)");
            // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client
            client.write(bb.toBuffer());
        });
    } catch(err) {
        if(metricsClient) {metricsClient.increment('miniplay.threeheadedmonkey.minivega.errors',1,0.25);}
        error(">>> Unable to connect ");
        callback(null);
        return false;
    }

    // Add a 'data' event handler for the client socket
    // data is what the server sent to this socket
    client.on('data', function(data) {
        var newbb = ByteBuffer.wrap(data);
        //newbb.printDebug();
        var size = newbb.readInt32(); /* minivega frame encoder, first 4 bytes is the message size */
        //log(">>> Data received "+size+"b");
        var decodedEnvelope = Envelope.decode(newbb);
        var decodedType = decodedEnvelope.protobufType;
        var decodedMessage = false;
        // Decode message ------------------
        var key;
        try {
            for (key in Envelope.Type) {
                if (Envelope.Type.hasOwnProperty(key)) {
                    //console.log(key+" = " + Envelope.Type[key]) ;
                    if (decodedType === Envelope.Type[key]) {
                        var typeName = key.split("_").join(".");
                        //log("Message decoded > "+typeName);
                        decodedMessage = builder.build("common."+(typeName)).decode(decodedEnvelope.protobufData);
                    }
                }
            }
        } catch (err) {
            decodedMessage = false;
        }
        // Close the client socket completely
        client.destroy();
        // Process message -----------------------
        if (!decodedMessage) {
            if(metricsClient) {metricsClient.increment('miniplay.threeheadedmonkey.minivega.errors',1,0.25);}
            error(">>> Unexpected message received or unable to decode: Envelope type "+decodedType+" ("+size+"b)");
            callback(null);
            return false;
        } else {
            log(">>> Message received: "+Object.getPrototypeOf( decodedMessage ).toString()+" ("+size+"b)");
            //log(">>> Message received: "+decodedType+" ("+size+"b)");
            callback(decodedMessage);
            return true;
        }
    });

    return encodedMessage.length;
}

/* Allow us to log errors, warnings and info's to our own logger system through Minivega */
function logInfo(environment, message, extendedmessage, userId) {
    send(function(response) {},"log",[options.loggerType,environment,message,extendedmessage,os.networkInterfaces().eth0[0].address],[10, userId]);
}
function logWarning(environment, message, extendedmessage, userId) {
    send(function(response) {},"log",[options.loggerType,environment,message,extendedmessage,os.networkInterfaces().eth0[0].address],[4, userId]);
}
function logError(environment, message, extendedmessage, userId) {
    send(function(response) {},"log",[options.loggerType,environment,message,extendedmessage,os.networkInterfaces().eth0[0].address],[1, userId]);
}


function init(customHost, customPort, customMetricsClient, customOptions) {
    if (customHost !== undefined) {
        host = customHost;
    }
    if (customPort !== undefined) {
        port = customPort;
    }
    if (customMetricsClient !== undefined) {
        metricsClient = customMetricsClient;
    }
    if (customOptions !== undefined) {
        options = mplib.extend(options, customOptions);
    }
    isServiceEnabled = true;
}

function disable() {
    isServiceEnabled = false;
}

function isEnabled() {
    return isServiceEnabled;
}

module.exports.init = init;
module.exports.isEnabled = isEnabled;
module.exports.disable = disable;
module.exports.send = send;
module.exports.logInfo = logInfo;
module.exports.logWarning = logWarning;
module.exports.logError = logError;