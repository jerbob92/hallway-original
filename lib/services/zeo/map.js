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
  sleepStats: 'sleepstat',
  zqScores: 'zqscore'
};
