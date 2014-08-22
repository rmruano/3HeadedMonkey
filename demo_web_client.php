<?php

// Demo users with demo friends
$users = array(
  array( "guest" => false, "userId" => 101, "userUid" => "pepe", "userSession" => "wqerqwerqwer-QWER", "pageType" => "myPage", "pageTypeId" => "123", "friends"=> "[102, 103]" ),
  array( "guest" => false, "userId" => 102, "userUid" => "paco", "userSession" => "wavxwwewerrq-WREQ", "pageType" => "myPage", "pageTypeId" => "123", "friends"=> "[101, 103]" ),
  array( "guest" => false, "userId" => 103, "userUid" => "pedro", "userSession" => "kqksdlqwerqw-FASR", "pageType" => "myPage", "pageTypeId" => "123", "friends"=> "[101, 102]" ),
);
shuffle($users); // Randomize to get one user
?>

<script src="//cdnjs.cloudflare.com/ajax/libs/socket.io/0.9.16/socket.io.min.js"></script>
<script>
    window.isOnline = false;
    //Starting socket.io
    var socket = io.connect("http://localhost/user", {
        'port': 8080,
        'connect timeout': 1000,
        'reconnect': true,
        'reconnection delay': 10000,
        'max reconnection attempts': 100,
        'force new connection':true
    });
    var setOffline;
    socket.on("connect", function(){
        if (!window.isOnline) {
            // Demo registered user
            socket.emit("init-user", {
                guest: false,
                userId: "<?php echo $users[0]['id'];?>",
                userUid: "<?php echo $users[0]['uid'];?>",
                userSession: "<?php echo $users[0]['userSession'];?>",
                pageType: "<?php echo $users[0]['pageType'];?>",
                pageTypeId: "<?php echo $users[0]['pageId'];?>",
                userFriends: "<?php echo $users[0]['friends'];?>",
                timestamp: <?php echo time();?>,
                userName: "<?php echo $users[0]['uid'];?>",
                userLevel: 1,
                userAvatar: "",
                userWeb: "",
                userLang: "es",
                userIsStaff: false,
                userShareStatus: true,
                userShareRoom: true
            });
            // Demo guest user
            // socket.emit("init-user", { guest: true, userId: "guest-123123123", userUid: "", userSession: "", pageType: "myPage", pageTypeId: "123", userWeb: "", userLang: "es" });
        }
    });
    socket.on("ready", function(data){
        if (!window.isOnline) {
            window.isOnline = true;
            console.dir(data);
            if (data.guest === true) {
                console.log("GUEST ONLINE!");
            } else {
                console.log("USER ONLINE!");
                if (data.hasOwnProperty("userConnectedFriends")) {
                    // @todo show connected friends
                }
            }
        }
    });
    socket.on("friend-connect", function(data){
        console.log("friend-connect");
        console.dir(data);
    });
    socket.on("friend-disconnect", function(data){
        console.log("friend-disconnect");
        console.dir(data);
    });
    /*socket.on("connecting", function(){
        if (!window.isOnline) {
            setOffline("connecting");
        }
    });*/
    socket.on("connect_failed", function(){
        setOffline("connect_failed");
    });
    socket.on("close", function(){
        setOffline("close");
    });
    socket.on("disconnect", function(){
        setOffline("disconnect");
    });
    socket.on("reconnect", function(){
        setOffline("reconnect");
    });
    /*socket.on("reconnecting", function(){
        setOffline("reconnecting");
    });*/
    /*socket.on("reconnect_failed", function(){
        setOffline("reconnect_failed");
    });*/
    socket.on("error", function(){
        setOffline("error");
    });
    setOffline = function(reason) {
        if (window.isOnline) {
            window.isOnline = false;
            console.log("OFFLINE: "+reason);
            //socket.disconnect(); /* Force a disconnect */
        }
    };
    // Query functions =======================
    function getRoomsStats() {
        socket.emit("get-rooms-stats",["page|user|myPage|123","asdfasd|asdfa"],function(data){
            console.dir(data);
        });
    }
    function getAllRoomStats() {
        socket.emit("get-all-rooms-stats",false,function(data){
            console.dir(data);
        });
    }
    function getStats() {
        socket.emit("get-stats",false,function(data){
            console.dir(data);
        });
    }
    function getUserStatus() {
        socket.emit("get-user-status",false,function(data){
            console.dir(data);
        });
    }
    function getUserFriendsConnected() {
        socket.emit("get-user-friends-connected",false,function(data){
            console.dir(data);
        });
    }

</script>