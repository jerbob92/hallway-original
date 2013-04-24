var request = require('request');

exports.sync = function(pi, cb) {
  request.get({
    url: "https://api.github.com/user?access_token=" + pi.auth.accessToken,
    json: true,
    headers:{"User-Agent":"singly.com"}
  }, function(err, resp, body) {
    if (err || !body) return cb(err);
    if (!body.id) {
      if (body.message) return cb('error from github: ' + body.message);
      return cb(
        new Error("invalid response from github: " + JSON.stringify(body))
      );
    }
    pi.auth.profile = body;
    pi.auth.pid = body.id + '@github'; // profile id
    var base = 'user:' + pi.auth.pid + '/self';
    var data = {};
    data[base] = [body];
    cb(null, {auth: pi.auth, data: data});
  });
};
