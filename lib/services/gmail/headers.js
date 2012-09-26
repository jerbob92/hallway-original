var imap = require("./imap/imap");
var lib = require("./lib");

var IMAP_PAGE_SIZE = 1000;

exports.sync = function(pi, callback) {
  var xoauth2 = lib.generateAuthString(pi);

  var ImapConnection = imap.ImapConnection;
  //create imap connection
  var conn = new ImapConnection({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      debug: true,
      xoauth2: xoauth2 
  });

  function errorCb(error) {
    conn.logout(function() {
      callback(error);
    });
  }
  conn.connect(function(error) {
    if (error) return errorCb(error);

    conn.openBox("[Gmail]/All Mail", true, function(error, box) {
      if (error || !box) return errorCb(error);
      if(box.messages && pi.auth.profile) pi.auth.profile.messages = box.messages.total; // stash here for convenience

      var lastSeenUID = 1;
      if (pi.config && pi.config.uid_validity && box.validity && pi.config.uid_validity == box.validity) {
        // Get more!
        lastSeenUID = (pi.config && pi.config.lastSeenUID) || 1;
      }
      console.log("Box:%j", box);
      var maxPullID = Math.min(lastSeenUID + IMAP_PAGE_SIZE, parseInt(box.uidnext));
      console.log("lastSeenUID(%s) maxPullID(%s)", lastSeenUID, maxPullID);

      var query = [["UID", lastSeenUID + ":" + maxPullID]];
      conn.search(query, function(error, messages) {
        if(error || !messages || messages.length == 0) return callback(error);
        var fetch = conn.fetch(messages);
        var msgInfo = [];
        fetch.on("message", function(msg) {
          msg.on("end", function() {
            msg.uid = msg.id;
            msg.id = msg["x-gm-msgid"];
            var timestamp = new Date(msg.date);
            msg.at = timestamp.getTime();
            msgInfo.push(msg);
          });
        });
        fetch.on("end", function() {
          conn.logout(function() {
            var config = {lastSeenUID:maxPullID, uid_validity:box.validity};
            if (maxPullID < box.uidnext) config.nextRun = -1;
            var data = {};
            data["envelope:" + pi.auth.pid + "/headers"]= msgInfo;
            callback(null, {config:config, auth:pi.auth, data:data});
          });
        });
      });
    });
  });
};
