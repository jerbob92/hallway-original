exports.profile = {
  gender: 'gender',
  oembed: function(data) {
    var ret = {
      id: data.id,
      title: data.name,
      url: data.link,
      thumbnail_url: data.picture,
      email: data.email,
      provider_name: 'google'
    };
    return ret;
  }
}

exports.defaults = {
  self: 'profile'
}

