var request = require('request');

exports.sync = function(pi, cb) {
  var headers = {};
  headers["Authorization"] = "Bearer " + pi.auth.token.access_token;
  headers["Accept"] = "application/vnd.com.runkeeper.User+json";

  request.get({uri:'https://api.runkeeper.com/user', headers: headers}, function(err, resp, user) {
    user = JSON.parse(user);
    headers["Accept"] = "application/vnd.com.runkeeper.Profile+json";

    request.get({uri:"https://api.runkeeper.com" + user.profile, headers: headers}, function(err, resp, profile) {
      if (err || !profile) return cb(err);
      profile = JSON.parse(profile);
      if (!profile.name) return cb(err);
      user.profile = profile;
      pi.auth.profile = user;
      pi.auth.pid = user.userID + '@runkeeper'; // profile id
      var base = 'user:' + pi.auth.pid + '/self';
      var data = {};
      data[base] = [user];
      cb(null, {auth: pi.auth, data: data});
    });
  });
};
