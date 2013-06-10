exports.ptype = 122; // must be unique per service, see dMap.js

exports.profile = {
  oembed: function(data) {
    var ret = {
      id            : data.edam_userId,
      provider_name : 'evernote'
    };
    return ret;
  }
};

exports.defaults = {
  self: 'profile'
};