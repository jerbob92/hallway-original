exports.account = {
  id: "uid"
};

exports.meta = {
  id: function(data) {
    return encodeURIComponent(data.path.toLowerCase());
  },
  at: function(data) {
    return Date.parse(data.modified);
  },
  text: 'path'
};

exports.defaults = {
  self: 'account',
  files: 'meta',
  folders: 'meta'
};
