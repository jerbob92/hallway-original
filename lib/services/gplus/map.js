exports.ptype = 119;

function timestamp(data) {
  var date = data.updated || data.published;

  return date ? new Date(date).valueOf() : false;
}

function profileImage(data) {
  return (data.image && data.image.url) ? data.image.url : false;
}

exports.contact = {
  id: 'id',
  at: function () {
    // XXX: Is this the default?
    return Date.now();
  },
  gender: 'gender',
  nickname: 'displayName',
  photo: profileImage,
  oembed: function (data) {
    return {
      type: 'contact',
      id: data.id,
      url: data.url,
      title: data.displayName,
      handle: data.displayName,
      description: data.aboutMe,
      thumbnail_url: profileImage(data),
      provider_name: 'gplus'
    };
  }
};

exports.activity = {
  id: 'id',
  at: timestamp
};

exports.photo = {
  at: timestamp,
  earliest: timestamp,
  oembed: function (data) {
    return {
      type: 'photo',
      id: data.id,
      title: data.content,
      url: data.fullImage.url,
      thumbnail_url: data.image.url,
      provider_name: 'gplus',
      provider_url: data.url
    };
  }
};

exports.defaults = {
  activities: 'activity',
  photos: 'photo',
  self: 'contact'
};

exports.types = {
  photos: ['photo:gplus/activities']
};
