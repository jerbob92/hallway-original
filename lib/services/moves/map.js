exports.profile = {
  id: "userId",
  oembed: function(data) {
    return {
      id            : data.userId.toString(),
      provider_name : 'moves'
    };
  }
};

exports.defaults = {
  self: 'profile'
};

