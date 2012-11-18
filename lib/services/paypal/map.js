exports.ptype = 112; // must be unique per service, see dMap.js

exports.contact = {
  id: function(data) {
    return data.identity.userId;
  },
  text: 'full_name'
};

exports.defaults = {
  self: 'contact'
};
