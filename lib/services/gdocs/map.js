exports.profile = {
  id: '_id',
  at: function(data) {
    return data.updated && data.updated.$t && Date.parse(data.updated.$t);
  }
};

exports.change = {
  id: function(data){
    return data.docs$changestamp && data.docs$changestamp.value;
  },
  at: function(data){
    return data.updated && data.updated.$t && Date.parse(data.updated.$t);
  }
};

exports.defaults = {
  self: 'profile',
  changes: 'change'
};

