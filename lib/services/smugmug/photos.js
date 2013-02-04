var path = require('path');
var entries = require('entries');
var idr = require('idr');
var lib = require(path.join(__dirname, 'lib'));
var async = require('async');

function syncAlbums(pi, cbDone) {

  // TODO: Later we can have an optimzed call where we check last sync time
  // for now it just syncs all albums no matter what

  // call the albums apis
  var params = {
    'method' : 'smugmug.albums.get',
    'Heavy' : true
  };

  lib.apiCall('GET', pi.auth, params, true, function(error, data) {

    // error getting the albums
    if(error) {
      return cbDone(error);
    }

    // no Albums element
    if(!data || !data.Albums) {
      return cbDone(new Error("missing albums"));
    }

    // store the albums
    pi.data = {};
    pi.data['album:' + pi.auth.pid + '/albums'] = data.Albums;

    // get the photos ids for all albums
    getPhotoIds(pi, data.Albums, cbDone);
  });
}

function getPhotoIds(pi, albums, cbDone) {

  // all albums and their photo ids
  var photoIds = [];

  // loop through the albums in sequence
  async.forEachLimit(albums, 5, function(album, cbAlbums) {

    var params = {
      "method" : "smugmug.images.get",
      "AlbumID" : album.id,
      "AlbumKey" : album.Key
    };

    // api call to get all photos for an album
    lib.apiCall('GET', pi.auth, params, true, function(error, data) {

      // TODO: ignoring album errors for now
      if(!error) {
        photoIds = photoIds.concat(data.Album.Images);
      }
      cbAlbums(null);

    });
  },
  function(error) {

    // error getting one or more album photo ids
    if(error) {
      return cbDone(error);
    }

    // sync the photos
    syncPhotos(pi, photoIds, cbDone);
  });
}

function syncPhotos(pi, photoIds, cbDone) {

  // all albums and their photo ids
  var photos = [];

  // loop through the albums in sequence
  async.forEachLimit(photoIds, 5, function(photoId, cbPhotos) {

    var params = {
      "method" : "smugmug.images.getInfo",
      "ImageID" : photoId.id,
      "ImageKey" : photoId.Key
    };

    // api call to get all photos for an album
    lib.apiCall('GET', pi.auth, params, true, function(error, data) {

      // TODO: ignoring single photo errors for now
      if(!error) {
        photos.push(data.Image);
      }
      cbPhotos(null);

    });

  },
  function(error) {

    // error getting one or more photos
    if(error) {
      return cbDone(error);
    }

    // store the photos if we have some
    if (photos.length > 0) {
      pi.data['photo:' + pi.auth.pid + '/photos'] = photos;
    }

    cbDone(null, pi);
  });
}

// syncs albums and photos for smugmug
exports.sync = function (pi, cbDone) {
  syncAlbums(pi, cbDone);
};
