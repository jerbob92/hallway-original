var request = require('request');

exports.sync = function(pi, cb) {
  console.log("MOVES",pi.auth)
  request.get({
    url: "https://api.moves-app.com/api/v1/user/profile?access_token=" + pi.auth.accessToken,
    json: true
  }, function(err, resp, body) {
    if (err || !body) return cb(err);
    if (!body.userId) {
      return cb(
        new Error("invalid response from moves: " + JSON.stringify(body))
      );
    }
    pi.auth.profile = body;
    pi.auth.pid = body.userId + '@moves'; // profile id
    var base = 'profile:' + pi.auth.pid + '/self';
    var data = {};
    data[base] = [body];
    cb(null, {auth: pi.auth, data: data});
  });
};
