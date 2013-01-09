var gdata = require('gdata-js');
var _ = require('underscore');

var ALBUM_URL = 'https://picasaweb.google.com/data/feed/api/user/default';

function checkAlbums(client, pi, cb) {
  client.getFeed(ALBUM_URL, {
    'max-results': 250
  }, function (err, result) {
    if (err) {
      return cb(err);
    }

    pi.config.albums = result.feed.entry;

    pi.data['album:' + pi.auth.pid + '/albums'] = result.feed.entry;

    // We got albums, that means we need to get photos next
    pi.config.nextRun = -1;

    cb(null, pi);
  });
}

exports.sync = function (pi, cb) {
  var client = gdata.clientFromAuth(pi.auth);

  if (!pi.config.albums) {
    pi.config.albums = [];
  }

  pi.data = {};

  if (pi.config.albums.length === 0) {
    return checkAlbums(client, pi, cb);
  }

  var base = 'photo:' + pi.auth.pid + '/photos';
  var photos = pi.data[base] = [];

  var album = pi.config.albums.pop();

  // Get the link to the photo feed for the album
  var link = _.find(album.link, function (link) {
    return link.rel === 'http://schemas.google.com/g/2005#feed';
  });

  client.getFeed(link.href, {
    'max-results': 250
  }, function (err, result) {
    if (err) {
      return cb(err);
    }

    result.feed.entry.forEach(function (photo) {
      photos.push(photo);
    });

    // Are there more albums?
    if (pi.config.albums.length > 0) {
      pi.config.nextRun = -1;
    }

    cb(null, pi);
  });
};
