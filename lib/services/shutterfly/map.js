exports.ptype = 115; // must be unique per service, see dMap.js

function val(dat) {
  return Array.isArray(dat) && dat[0];
}

exports.album = {
  id: function(data) {
    // Shutterfly reports it as a full URL
    var parts = data.id[0].split('/');
    return parts[parts.length - 1];
  },
  at: function(data) {
    return new Date(data.updated[0]).valueOf();
  }
};

exports.user = {
  id: function (data) {
    return val(data["openfly:userid"]);
  },
  oembed: function (data) {
    var ret = { type: 'contact' };
    ret.title = val(data['user:firstName']) + ' ' + val(data['user:lastName']);
    ret.email = val(data['user:email']);
    ret.provider_name = 'shutterfly';
    return ret;
  }
};

exports.defaults = {
  self: 'user',
  albums: 'album'
};
