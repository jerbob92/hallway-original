exports.ptype = 121; // must be unique per service, see dMap.js

exports.album = {
  id: function(data) {
    return data.id;
  },
  at: function() {
    return new Date(data.LastUpdated).valueOf();
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

exports.defaults = {
  self: 'profile',
  albums: 'album'
};