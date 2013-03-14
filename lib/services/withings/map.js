exports.defaults = {
  self: 'profile',
  measures: 'measure'
};

exports.profile = {
  id: 'id',
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.id = data.id;
    ret.title = [data.firstname, data.lastname].filter(Boolean).join(' ');
    ret.provider_name = 'withings';
    return ret;
  }
};
