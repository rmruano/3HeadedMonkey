var socketio    = require("socket.io"),
    minivega    = require("./modules/minivega.js"),
    memwatch = require('memwatch'),
    userHandler = require("./modules/socketio/userHandler.js"),
    statusHandler = require("./modules/statusHandler/server.js"),
    StatsD = require('node-statsd').StatsD,
    heapdump = require('heapdump'),
    metricsClient,
    productionMode = false,
    socketPort = 8000,
    statusServerPort = 8001;

var options = {
    log: !productionMode, // log
    productionMode: productionMode, // Is production?
    environment: "dev",
    printUsage: false
};

// Configuration

    // Setup server port
    if(!isNaN(process.argv[3]) && process.argv[3] <= 65535 ) {
        socketPort = parseInt(process.argv[3], 10);
    } else {
        console.log("Three Headed Monkey Server port provided is not valid. Using default port " + socketPort + " ....");
    }
    if(!isNaN(process.argv[4]) && process.argv[4] <= 65535 ) {
        statusServerPort = parseInt(process.argv[4], 10);
    } else {
        console.log("Status Server port provided is not valid. Using default port " + statusServerPort + " ....");
    }

    // Setup server environment
    if (process.argv.length>2 && process.argv[2] === "prod") {
        productionMode = true;
        options.environment = "production";
        options.productionMode = true;
        options.printUsage = true;
        options.log = false;
        console.log("Starting server (PROD environment)...");
        socketio = socketio.listen(socketPort, {log:false});
        //socketio.server.removeListener('request', socketio.server.listeners('request')[0]);
        metricsClient = new StatsD({host: 'mj-stats'});
        minivega.init("localhost", 40001, metricsClient,{retries:3, log:false, productionMode: productionMode});
    } else {
        console.log("Starting server (DEV environment)... Use 'node server.js prod' to use the PROD environment.");
        options.environment = "dev";
        options.printUsage = true;
        options.log = true;
        socketio = socketio.listen(socketPort, {log:false});
        //socketio.server.removeListener('request', socketio.server.listeners('request')[0]);
        metricsClient = false;
        minivega.init("localhost", 40001, metricsClient, {retries:3, log:true, productionMode: productionMode});
    }

// Disable minivega connectivity through protocol buffers, you won't have this but it's provided in case you want to take a look at how it works
    minivega.disable(); // Friends won't be loaded from our backend if disabled

// Allow CORS
    socketio.set( 'origins', '*yourdomain.com*' );

// Socket handlers
    userHandler.init(socketio, minivega, metricsClient, heapdump, options);
// 3 headed monkey status handler
    statusHandler.init(userHandler, statusServerPort, minivega, options);

// Memory watchers
    memwatch.on('leak', function(info) {
        //minivega.logWarning(options.environment, "3 Headed monkey Memory Leak", JSON.stringify(info),0);
    });
    memwatch.on('stats', function(stats) {
        //minivega.logInfo(options.environment, "3 Headed monkey Memory Heap Usage Stats", JSON.stringify(stats),0);
    });


// OK
    console.log("=========================================================");
    console.log("THREE-HEADED MONKEY server started on port "+socketPort);
    console.log("=========================================================");

    //minivega.logInfo(options.environment, "Three Headed Monkey Started", JSON.stringify(process.argv),0);