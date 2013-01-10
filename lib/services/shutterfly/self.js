var path = require('path');

var lib = require(path.join(__dirname, 'lib'));

exports.sync = function (pi, cb) {
  lib.get(pi, '/', function(err, profile) {
    if (err) return cb(err);

    pi.auth.pid = pi.auth.user + '@shutterfly';
    pi.auth.profile = profile.feed;

    var data = {};
    data['user:' + pi.auth.pid + '/self'] = [profile.feed];

    cb(null, { data: data, auth: pi.auth });
  });
};
