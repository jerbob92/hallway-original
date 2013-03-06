exports.ptype = 105; // must be unique per service, see dMap.js

exports.contact = {
  name: 'full_name',
  photo: 'profile_picture',
  nickname: 'username',
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.url = (data.website && data.website.length > 0) ?
                data.website :
                'http://followgram.me/' + data.username;
    ret.title = data.full_name;
    if (data.bio && data.bio.length > 0) ret.description = data.bio;
    ret.thumbnail_url = data.profile_picture;
    ret.provider_name = 'instagram';
    ret.handle = data.username;
    ret.id = data.id;
    return ret;
  },
  text: 'username'
};

exports.photo = {
  at: function(data) {
    return data.created_time * 1000;
  },
  earliest: function(data) {
    return data.created_time * 1000;
  },
  ll: function(data) {
    if (data.location && data.location.latitude && data.location.longitude) {
      return [data.location.latitude, data.location.longitude];
    }
  },
  oembed: function(data) {
    var ret = {type:'photo'};
    if (data.caption) ret.title = data.caption.text;
    ret.height = data.images.standard_resolution.height;
    ret.width = data.images.standard_resolution.width;
    ret.url = data.images.standard_resolution.url;
    ret.provider_name = 'instagram';
    if (data.link) ret.provider_url = data.link;
    if (data.user && data.user.full_name) ret.author_name = data.user.full_name;
    return ret;
  },
  author: function(data) {
    if (!data.user) return undefined;
    var ret = {};
    ret.name =  data.user.full_name;
    ret.url = (data.user.website && data.user.website.length > 0) ?
                data.user.website :
                'http://followgram.me/' + data.user.username;
    ret.photo = data.user.profile_picture;
    return ret;
  },
  participants: function(data) {
    var ret = {};
    if (data.user) ret[data.user.id] = {"author": true};
    if (data.likes && Array.isArray(data.likes.data)) {
      data.likes.data.forEach(function(like) {
        ret[like.id] = ret[like.id] || {};
      });
    }
    if (data.comments && Array.isArray(data.comments.data)) {
      data.comments.data.forEach(function(comment) {
        if (comment.from) ret[comment.from.id] = ret[comment.from.id] || {};
      });
    }
    return (Object.keys(ret).length > 0) ? ret : undefined;
  }
};

exports.checkin = {
  oembed: function(data) {
    if (!data.location || !data.location.id) return undefined;
    var ret = {type:'checkin'};
    ret.lat = data.location.latitude;
    ret.lng = data.location.longitude;
    ret.title = data.location.name;
    ret.url = data.link;
    ret.provider_name = 'instagram';
    if (data.user && data.user.full_name) ret.author_name = data.user.full_name;
    return ret;
  }
};

exports.defaults = {
  follows: 'contact',
  feed: 'photo',
  media: 'photo',
  self: 'contact'
};

exports.types = {
  photos: ['photo:instagram/media'],
  photos_feed: ['photo:instagram/feed'],
  contacts: ['contact:instagram/follows'],
  checkins: ['checkin:instagram/media'],
  checkins_feed: ['checkin:instagram/feed']
};

exports.pumps = {
  types: {
    photo: function(entry) {
      if (!entry.types) entry.types = {};
      if (entry.data.location && entry.data.location.id) entry.types.checkin = true;
    }
  }
};

var crypto = require('crypto');
exports.guid = {
  'photo': function(entry) {
    if (!entry.data.link) return undefined;
    var guids = [];
    var match;
    if ((match = /instagr.am\/p\/([^\/]+)\//.exec(entry.data.link))) {
      guids.push('guid:instagram/#' + match[1]);
  }
    if (entry.data.caption && entry.data.caption.text &&
        entry.data.caption.text.length > 0) {
      var guid =
        crypto.createHash('md5').update(entry.data.caption.text).digest('hex');
      guids.push('caption:instagram/#' + guid);
    }
    if (guids.length === 0) return undefined;
    return guids.join(' ');
  }
};
