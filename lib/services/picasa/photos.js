var gdata = require('gdata-js');
var _ = require('underscore');

var MAX_RESULTS = 100;
var ALBUM_URL = 'https://picasaweb.google.com/data/feed/api/user/default';

function checkAlbums(client, pi, cb) {
  client.getFeed(ALBUM_URL, {
    'start-index': pi.config.albumIndex,
    'max-results': MAX_RESULTS
  }, function (err, result) {
    if (err) {
      return cb(err);
    }

    if (result.feed.entry) {
      result.feed.entry.forEach(function (album) {
        pi.config.albums.push(album);
      });

      pi.data['album:' + pi.auth.pid + '/albums'] = result.feed.entry;

      if (result.feed.entry.length === MAX_RESULTS) {
        pi.config.albumIndex += MAX_RESULTS;
      }
    } else {
      delete pi.config.albumIndex;
    }

    // We got albums, that means we need to get photos next
    if (pi.config.albums.length) {
      pi.config.nextRun = -1;
    }

    cb(null, pi);
  });
}

exports.sync = function (pi, cb) {
  var client = gdata.clientFromAuth(pi.auth);

  if (!pi.config.albums) {
    pi.config.albums = [];
  }

  if (!pi.config.albumIndex) {
    pi.config.albumIndex = 1;
  }

  pi.data = {};

  if (pi.config.albums.length === 0 || pi.config.albumIndex  > 1) {
    delete pi.config.photoIndex;

    return checkAlbums(client, pi, cb);
  }

  var base = 'photo:' + pi.auth.pid + '/photos';
  var photos = pi.data[base] = [];

  var album = pi.config.albums.pop();

  // Get the link to the photo feed for the album
  var link = _.find(album.link, function (link) {
    return link.rel === 'http://schemas.google.com/g/2005#feed';
  });

  if (!pi.config.photoIndex) {
    pi.config.photoIndex = {};
  }

  if (!pi.config.photoIndex[album.id.$t]) {
    pi.config.photoIndex[album.id.$t] = 1;
  }

  client.getFeed(link.href, {
    'start-index': pi.config.photoIndex[album.id.$t],
    'max-results': MAX_RESULTS
  }, function (err, result) {
    if (err) {
      return cb(err);
    }

    result.feed.entry.forEach(function (photo) {
      photos.push(photo);
    });

    // Are there possibly more photos?
    if (photos.length === MAX_RESULTS) {
      pi.config.photoIndex[album.id.$t] += MAX_RESULTS;

      pi.config.albums.push(album);
    }

    // Are there more albums?
    if (pi.config.albums.length > 0) {
      pi.config.nextRun = -1;
    }

    cb(null, pi);
  });
};
