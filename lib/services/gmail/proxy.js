var Imap = require("imap");
var lib = require("./lib");

exports.proxy = function (auth, req, res) {
  // Right now we only accept fetches
  if (req.url !== "/raw") {
    res.send(403);
    return;
  }

  var xoauth = lib.generateAuthString({ auth: auth });

  //create imap connection
  var conn = new Imap({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    debug: true,
    xoauth: xoauth
  });

  function errorCb(error) {
    conn.logout(function () {
      throw new Error(error);
    });
  }

  conn.connect(function (error) {
    if (error) throw new Error(error);

    conn.openBox("[Gmail]/All Mail", true, function (error) {
      if (error) return errorCb(error);

      var options = { request: { headers: false, struct: false, body: true } };

      if (req.query.markSeen &&
          (req.query.markSeen === true || req.query.markSeen === "true")) {
        options.markSeen = true;
      }

      console.log("Getting %s", req.query.id);

      var fetch = conn.fetch(req.query.id, options);
      var fetched = [];

      fetch.on("message", function (msg) {
        var raw = "";
        msg.on("data", function (data) {
          if (data) raw += data;
        });
        msg.on("end", function () {
          fetched.push(raw);
        });
      });

      fetch.on("end", function () {
        res.send(fetched);
        conn.logout();
      });
    });
  });
};
