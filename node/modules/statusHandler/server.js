/*jslint latedef: false */
var http = require("http"),
    util = require('util'),
    url = require("url"),
    mplib = require("../mplib.js"),
    requestHandler = require("./requestHandler"),
    port = 8001,
    handle = {};

var userHandler,
    minivega,
    options,
    server,
    router;

/**
 * API Handlers
 * @type {status}
 */
handle["/"] = requestHandler.status;
//handle["/list"] = requestHandler.list;
handle["/status"] = requestHandler.status;
handle["/users"] = requestHandler.printUsers;
handle["/users/count"] = requestHandler.printCountUsers;
handle["/config"] = requestHandler.config;
handle["/config/userHandler/put"] = requestHandler.putUserHandlerConfig;

/**
 * API HTTP Server
 * @param route
 * @param handle
 */
server = function(route, handle) {
    function onRequest(request, response) {
        var pathname = url.parse(request.url).pathname;
        var parameters = url.parse(request.url, true).query;

        response.writeHead(200, {"Content-Type": "application/json"});
        var content = router(handle, pathname, parameters);
        response.write(JSON.stringify(content));
        response.end();
    }

    http.createServer(onRequest).listen(port);
    console.log("=========================================================");
    console.log("THREE-HEADED MONKEY STATUS server started on port " + port);
    console.log("=========================================================");
};

/**
 * Request router (each request made to the status api will be routed here)
 * @param handle
 * @param pathname
 * @returns {*}
 */
router = function(handle, pathname, parameters) {
    if (typeof handle[pathname] === 'function') {
        return handle[pathname](userHandler, parameters);
    } else {
        return {status: "KO", code: 404, message: "Handler "+ pathname +" Parameters( "+ parameters +" not found"};
    }
};

/**
 * Status handler server init
 * @param currentUserHandler
 * @param currentMinivega
 * @param customOptions
 */
function init(currentUserHandler, currentServerPort, currentMinivega, customOptions) {
    userHandler = currentUserHandler;
    minivega = currentMinivega;
    port = currentServerPort;
    options = customOptions;

    if (options !== undefined) {
        options = mplib.extend(options, customOptions);
    }

    server(router, handle);
}

exports.route = router;
exports.run = server;
exports.init = init;