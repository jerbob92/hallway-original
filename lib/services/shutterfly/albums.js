var path = require('path');

var lib = require(path.join(__dirname, 'lib'));

exports.sync = function (pi, cb) {
  lib.get(pi.auth, '/album', function(err, albums) {
    if (err) return cb(err);

    var data = {};
    data['album:' + pi.auth.pid + '/albums'] = albums.feed.entry;

    cb(null, { data: data });
  });
};
