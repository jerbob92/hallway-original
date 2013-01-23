var lib = require("./lib");
var imap = require("imap");
var request = require("request");

exports.sync = function(pi, cbDone) {
  request.get({
    uri     : 'https://www.googleapis.com/oauth2/v1/userinfo',
    headers : {authorization: 'Bearer ' + pi.auth.token.access_token},
    json    : true
  }, function(err, resp, me) {
    if (err) return cbDone(err);
    if (resp.statusCode !== 200 || !me || !me.id) {
      return cbDone(new Error(resp.statusCode+': '+JSON.stringify(me)));
    }
    console.log("%j", me);
    var emailAddy = me.email;
    pi.auth.pid = encodeURIComponent(emailAddy) + '@gmail';
    pi.auth.profile = me;

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

    conn.connect(function(error) {
      if (error) {
        conn.logout(function() {
          console.log("************* connect error: %s", error);
          cbDone(error);
        });
        return;
      }
      conn.getBoxes(function(error, boxes) {
        if (error) {
          conn.logout(function() {
            console.log("************* getBoxes error: %s", error);
            cbDone(error);
          });
          return;
        }

        var allBoxes = [];
        function parseBoxes(box, list) {
          Object.keys(box).forEach(function(subbox) {
            var curBox = {
              name:subbox,
              delim:box[subbox].delim
            };
            if (box[subbox].children) {
              curBox.children = [];
              parseBoxes(box[subbox].children, curBox.children);
            }
            list.push(curBox);
          });
        }
        parseBoxes(boxes, allBoxes);
        conn.logout(function() {
          var data = {};
          data["profile:" + pi.auth.pid + "/self"] =
            [{id:emailAddy, boxes:allBoxes, profile:me}];
          cbDone(null, {auth:pi.auth, data:data});
        });
      });
    });
  });
};
