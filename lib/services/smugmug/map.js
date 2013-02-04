exports.ptype = 121; // must be unique per service, see dMap.js

exports.photo = {
  at: function(data) {
    return new Date(data.LastUpdated).getTime();
  },
  oembed: function(data) {
    return {
      type: 'photo',
      provider_name: 'smugmug',
      title: data.Caption,
      url: data.OriginalURL,
      thumbnail_url: data.ThumbURL
    };
  }
};

exports.album = {
  at: function(data) {
    return new Date(data.LastUpdated).getTime();
  }
};

exports.profile = {
  oembed: function(data) {
    return {
      id            : data.id,
      title         : data.Name,
      url           : data.URL,
      provider_name : 'smugmug'
    };
  }
};

exports.types = {
  photos : ['photo:smugmug/photos']
};

exports.defaults = {
  self: 'profile',
  albums: 'album',
  photos: 'photo'
};