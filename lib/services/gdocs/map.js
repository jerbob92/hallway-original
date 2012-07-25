exports.change = {
  id:'_id',
  at:function(data){ return data.updated && data.updated.$t && Date.parse(data.updated.$t) }
}

exports.defaults = {
  self: 'profile'
}

