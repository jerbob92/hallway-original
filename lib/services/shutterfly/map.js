exports.ptype = 115; // must be unique per service, see dMap.js

var _s = require('underscore.string');

function parseID(url) {
  var parts = url.split('/');
  return parts[parts.length - 1];
}

function earliestTime(data) {
  if (data["sflymedia:capturetime"] && parseInt(data["sflymedia:capturetime"][0]) > 0) return parseInt(data["sflymedia:capturetime"][0]);
  if (data["sflymedia:uploadtime"] && parseInt(data["sflymedia:uploadtime"][0]) > 0) return parseInt(data["sflymedia:uploadtime"][0]);
  return new Date(data.published[0]).valueOf();
}

function updatedTime(data) {
  return new Date(data.updated[0]).valueOf();
}

// See http://www.shutterfly.com/documentation/api_Proctaserv.sfly#GET
var SIZE_BYTE = 35;
var PHOTO_SIZES = {
  800: 5,
  480: 6,
  400: 7,
  200: 8,
  96:  9
};
function photoUrl(url, size) {
  if (!PHOTO_SIZES[size]) return url;

  var id = parseID(url);
  var parts = url.split('/');
  parts[parts.length - 1] = _s.splice(id, SIZE_BYTE, 1, PHOTO_SIZES[size]);
  return parts.join('/');
}

function val(dat) {
  return Array.isArray(dat) && dat[0];
}

exports.album = {
  id: function(data) {
    return parseID(data.id[0]);
  },
  at: updatedTime
};

exports.photo = {
  id: function(data) {
    return data.id[0];
  },
  at: updatedTime,
  earliest: earliestTime,
  oembed: function(data) {
    var url = data.content[0]._;
    return {
      type: 'photo',
      provider_name: 'shutterfly',
      title: data.title[0],
      url: photoUrl(url, 800),
      thumbnail_url: photoUrl(url, 96)
    };
  }
};

exports.user = {
  id: function (data) {
    return val(data["openfly:userid"]);
  },
  oembed: function (data) {
    var ret = { type: 'contact' };
    ret.title = val(data['user:firstName']) + ' ' + val(data['user:lastName']);
    ret.email = val(data['user:email']);
    ret.provider_name = 'shutterfly';
    return ret;
  }
};

exports.defaults = {
  self: 'user',
  albums: 'album',
  photos: 'photo'
};

exports.types = {
  photos: ['photo:shutterfly/photos']
};
