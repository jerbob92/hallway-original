exports.contact = {
  id: 'key',
  photo: 'icon',
  oembed: function(data) {
    return {
      type:'contact',
      id: data.key,
      url: 'http://rdio.com' + data.url,
      title: data.firstName + ' ' + data.lastName,
      thumbnail_url: data.icon,
      provider_name: 'rdio',
    };
  }
};

exports.profile = exports.contact;

exports.types = {
  contacts: ['contact:rdio/following']
};

exports.defaults = {
  self: 'profile',
  following: 'contact'
};
