ThreeHeadedMonkey
=================

A discarded POC of a Websockets server for online presence services in NodeJS featuring:

- Socketio for the websockets server
- A small REST server
- Protocol buffers messaging
- Communication with a backend TCP server to read friends
- Statsd metrics to track usage

Please be noticed that this server was built just to test performance, so, it has not received the love it deserves.

- ```socketio/userHandler.js``` handles the users & guests connections
- ```statusHandler``` module creates a small REST server with an API to retrieve real-time stats
- ```minivega.js``` for the communication with our backend
- ```Protocol.proto``` is the protocol buffers file describing the objects, it doesn't need to be compiled.

How to run
----------------
```
cd node
npm install
node server.js dev 8080 8081

Full syntax: node server.js [dev|prod] [websockets-port] [rest-port]
```

Protocol buffers & friends loading
----------------------------------

Protocol buffers is used to communicate with one of our back-end services (known as minivega) to retrieve the user friends.
Take a look at minivega.js, where all the communication is performed,  all messages are encoded into a common envelope,
which will be the only type of message sent through the wire. This double encoding/decoding has proved to be simple, effective and with good performance.

Our back-end service is a multi-threaded TCP server developed in JAVA using the netty library which supports protocol
buffers natively by double decoding the message (the pipeline & handlers must be configured appropiately).

As you won't have it, ```minivega.disable();``` is automatically called to disable it. In case is disabled, a friends-ids list can be provided on initialization.

Why it has been dropped?
------------------------

Due the single thread limitation, this service had a limit of 9000 concurrent connections at 300% CPU usage.
The multi-threaded JAVA port of this service can easily handle 15000 concurrent connections with 10% CPU usage in the same server.
