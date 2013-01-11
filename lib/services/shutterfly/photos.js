var path = require('path');

var entries = require('entries');
var idr = require('idr');
var lib = require(path.join(__dirname, 'lib'));

function queueAlbums(pi, callback) {
  if (pi.config.albums && pi.config.albums.length > 0) return callback(null);

  pi.config.albums = [];

  entries.runBases(['album:' + pi.auth.pid + '/albums'], {}, function(album) {
    pi.config.albums.push(idr.parse(album.idr).hash);
  }, callback);
}

exports.sync = function (pi, callback) {
  if (!pi.config.lastAlbumsSync) {
    pi.config.nextRun = 10; // Give the albums synclet 10 seconds
    return callback(null, pi);
  }

  queueAlbums(pi, function(err) {
    if (err) return callback(err, pi);

    if (pi.config.albums.length === 0) {
      return callback('No albums to sync', pi);
    }

    var albumID = pi.config.albums.shift();

    // Shutterfly doesn't appear to have paging; we just get everything
    lib.get(pi.auth, '/albumid/' + albumID, {
      qs: {
        // Needed to include images after future API change.
        // See http://www.shutterfly.com/documentation/api_Album.sfly
        'category-term': 'image'
      }
    }, function(err, album) {
      if (err) {
        pi.config.albums.push(albumID);
        return callback(err, pi);
      }

      pi.data = {};
      var base = 'photo:' + pi.auth.pid + '/photos';
      pi.data[base] = album.feed.entry;

      if (pi.config.albums.length > 0) pi.config.nextRun = -1;

      callback(null, pi);
    });
  });
};
