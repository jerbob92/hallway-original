var imap = require("imap");
var lib = require("./lib");
var contacts = require("./contacts");

var IMAP_PAGE_SIZE = 1000;

exports.sync = function (pi, callback) {
  //console.log("pi:%j", pi);
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
    conn.logout(function () {
      callback(error);
    });
  }

  conn.connect(function (error) {
    if (error) return callback(error);

    conn.openBox("[Gmail]/All Mail", true, function (error, box) {
      if (error || !box) return errorCb(error);

      if (box.messages && pi.auth.profile) {
        // stash here for convenience
        pi.auth.profile.messages = box.messages.total;
      }

      var lastSeenUID = 1;
      if (pi.config &&
        pi.config.uid_validity &&
        box.uidvalidity &&
        pi.config.uid_validity === box.uidvalidity) {
        // Get more!
        lastSeenUID = (pi.config && pi.config.lastSeenUID) || 1;
      }
      //console.log("Box:%j", box);
      var maxPullID = Math.min(lastSeenUID + IMAP_PAGE_SIZE,
        parseInt(box.uidnext, 10));
      //console.log("lastSeenUID(%s) maxPullID(%s)", lastSeenUID, maxPullID);

      var query = [["UID", lastSeenUID + ":" + maxPullID]];

      conn.search(query, function (error, messages) {
        if (error || !messages || messages.length === 0) return callback(error);

        conn.fetch(messages, {
          struct: true
        }, {
          headers: true,
          cb: function (fetch) {
            var msgInfo = [];

            fetch.on("message", function (msg) {
              msg.on('headers', function (headers) {
                msg.headers = headers;
              });

              msg.on("end", function () {
                msg.uid = msg.id;
                msg.id = msg["x-gm-msgid"];
                var timestamp = new Date(msg.date);
                msg.at = timestamp.getTime();
                msgInfo.push(msg);
              });
            });

            fetch.on("end", function () {
              conn.logout(function () {
                //console.log("Finding contacts");
                contacts.findContacts({ auth: pi.auth, config: pi.config },
                  msgInfo, function (error, results) {
                  var config = {
                    lastSeenUID: maxPullID,
                    uid_validity: box.uidvalidity
                  };
                  if (maxPullID < box.uidnext) config.nextRun = -1;
                  var data = {};

                  // Merge in contacts data and config if it finished properly
                  if (!error) {
                    if (results.data) {
                      Object.keys(results.data).forEach(function (key) {
                        data[key] = results.data[key];
                      });
                    }

                    if (results.config) {
                      Object.keys(results.config).forEach(function (key) {
                        config[key] = results.config[key];
                      });
                    }
                  }

                  data["envelope:" + pi.auth.pid + "/headers"] = msgInfo;

                  callback(null, { config: config, auth: pi.auth, data: data });
                });
              });
            });
          }
        }, function (err) {
          if (err) callback(err);
        });
      });
    });
  });
};
