// http://www.flickr.com/services/api/flickr.contacts.getList.html
exports.contact = {
  name: function(data) {
      return data.realname;
  },
  at: function(data) { return new Date().valueOf() },
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.nsid = data.nsid;
    ret.realname = data.realname;
    ret.username = data.username;
    ret.iconserver = data.iconserver;
    ret.friend = data.friend;
    ret.family = data.family;
    ret.ignored = data.ignored;
    ret.provider_name = 'flickr';
    ret.id = encodeURIComponent(data.id);
    return ret;
  }
}

// http://www.flickr.com/services/api/flickr.people.getPhotos.html
exports.photo = {
  media: 'source',
  oembed: function(data) {
    var ret = {
      type          : 'photo',
      title         : data.title,
      url           : 'http://farm' + data.farm + '.staticflickr.com/' + data.server + '/' + data.id + '_' + data.secret + '_b.jpg',
      thumbnail_url : 'http://farm' + data.farm + '.staticflickr.com/' + data.server + '/' + data.id + '_' + data.secret + '_t.jpg',
      provider_name : 'flickr'
    };
    return ret;
  }
}

exports.defaults = {
  self: 'profile',
  photos: 'photo'
}

exports.types = {
  photos: ['photo:flickr/photos']
}
