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
    return ret;
  },
}

// http://www.flickr.com/services/api/flickr.people.getPhotos.html
exports.photo = {
  
}

// http://www.flickr.com/services/api/flickr.photos.getContactsPhotos.html
exports.contact_photo = {
  
}

exports.defaults = {
  self: 'profile',
  contacts: 'contact',
  photos: 'photo'
}
// 
// exports.defaults = {
//   self: 'profile',
//   contacts: 'contact', 
//   photos: 'photo', 
//   photos_feed: 'contact_photo' 
// }