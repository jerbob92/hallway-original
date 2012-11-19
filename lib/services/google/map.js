exports.profile = {
  gender: 'gender',
  oembed: function(data) {
    return {
      id            : data.id,
      title         : data.name,
      url           : data.link,
      thumbnail_url : data.picture,
      email         : data.email,
      provider_name : 'google'
    };
  }
};

exports.defaults = {
  self: 'profile'
};

