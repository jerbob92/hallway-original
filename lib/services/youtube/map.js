exports.profile = {
  id: function(data) {
    return data.yt$userId && data.yt$userId.$t;
  },
  at: function(data) {
    return data.published && data.published.$t && Date.parse(data.published.$t);
  },
  oembed: function(data) {
    return {
      name: data.title && data.title.$t,
      handle: data.yt$username && data.yt$username.$t,
      thumbnail_url: data.media$thumbnail && data.media$thumbnail.url,
      location: data.yt$location && data.yt$location.$t,
      provider_name: 'youtube'
    };
  }
};

exports.video = {
  id: function(data) {
    return data.id && data.id.$t && require('path').basename(data.id.$t);
  },
  at: function(data){
    return data.updated && data.updated.$t && Date.parse(data.updated.$t);
  }
};

exports.defaults = {
  self: 'profile',
  uploads: 'video'
};

