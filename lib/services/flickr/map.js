// http://www.flickr.com/services/api/flickr.people.getInfo.html
/*
exports.profile = {
  id:'_id',
  at:function(data){ return data.updated && data.updated.$t && Date.parse(data.updated.$t) }
}*/


// http://www.flickr.com/services/api/flickr.contacts.getList.html
exports.contact = {
  
}

// http://www.flickr.com/services/api/flickr.people.getPhotos.html
exports.photo = {
  
}

// http://www.flickr.com/services/api/flickr.photos.getContactsPhotos.html
exports.contact_photo = {
  
}

exports.defaults = {
  self: 'profile'
}
/*
exports.defaults = {
  self: 'profile',
  contacts: 'contact', 
  photos: 'photo', 
  photos_feed: 'contact_photo' 
}*/

/*
exports.types = {
  photos: ['photo:flickr/photos'],
  photos_feed: ['photo:flickr/contacts_photos'],
  contacts: ['contact:flickr/contacts']
}
*/