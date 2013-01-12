var path = require('path');

var lib = require(path.join(__dirname, 'lib'));

exports.sync = function (pi, cb) {
  lib.get(pi.auth, '/album', function(err, albums) {
    if (err) return cb(err);

    pi.data = {};
    pi.data['album:' + pi.auth.pid + '/albums'] = albums.feed.entry;

    pi.config.lastAlbumsSync = Date.now();

    cb(null, pi);
  });
};
