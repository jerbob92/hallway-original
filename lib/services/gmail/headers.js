var imap = require("imap");
exports.sync = function(pi, callback) {
  var options = {
    host:"imap.gmail.com",
    secure:true,
    port:993,
    debug:function(msg) {
      console.log(msg);
    }
  };
  if (pi.auth.token) {
    var buf = new Buffer("user=" + pi.auth.username + "\1auth=Bearer " + pi.auth.token + "\1\1");
    options.xoauth = buf.toString("base64");
  } else {
    options.username = pi.auth.username;
    options.password = pi.auth.password;
  }
  var conn = new imap.ImapConnection(options);
  function errorCb(error) {
    conn.logout(function() {
      callback(error);
    });
  }
  conn.connect(function(error) {
    if (error) return errorCb(error);

    conn.openBox("[Gmail]/All Mail", true, function(error, box) {
      if (error) return errorCb(error);

      conn.search(["ALL", ["SINCE", "Jan 1, 2012"]], function(error, messages) {
        var fetch = conn.fetch(messages);
        var msgInfo = [];
        fetch.on("message", function(msg) {
          msgInfo.push(msg);
        });
        fetch.on("end", function() {
          conn.logout(function() {
            callback(null, {auth:pi.auth, data:msgInfo});
          });
        });
      });
    });
  });
};
