var lib = require('./lib');

exports.sleepstat = {
  id: function(data) {
    var id;
    lib.datetimeToID(data.bedTime, function(err, result){
      id = result;
    });
    return id;
  }
};

exports.defaults = {
  self: 'profile',
  sleep_stats: 'sleepstat',
  zq_scores: 'zqscore'
};
