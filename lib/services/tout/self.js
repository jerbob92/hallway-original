var request = require('request');
var util = require('util');

exports.sync = function(pi, cb) {
  request.get({
    uri: 'https://api.tout.com/api/v1/me?access_token=' + pi.auth.accessToken,
    json: true
  }, function(err, resp, js) {
    if (err) {
      return cb(err);
    }

    if (resp.statusCode !== 200) {
      return cb(new Error("status code " + resp.statusCode + " " + util.inspect(js)));
    }

    if (!js || !js.user) {
      return cb(new Error("missing response.user: " + util.inspect(js)));
    }

    var self = js.user;
    var auth = pi.auth;

    auth.profile = self; // map to shared profile
    auth.pid = self.uid + '@tout'; // profile id

    var base = 'contact:' + auth.pid + '/self';
    var data = {};

    data[base] = [self];

    cb(null, { auth: auth, data: data });
  });
};
