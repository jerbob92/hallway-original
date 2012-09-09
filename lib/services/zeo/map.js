var lib = require('./lib');

exports.sleeprecord = {
  id: function(data) {
    var id;

    // XXX: How does this work with a callback?
    lib.datetimetoid(data.bedtime, function(err, result) {
      id = result;
    });

    return id;
  }
};

exports.sleepstat = {
  id: function(data) {
    var id;

    // XXX: How does this work with a callback?
    lib.datetimetoid(data.bedtime, function(err, result) {
      id = result;
    });

    return id;
  }
};

exports.defaults = {
  self: 'profile',
  sleep_stats: 'sleepstat',
  sleep_records: 'sleeprecord',
  zq_scores: 'zqscore'
};
