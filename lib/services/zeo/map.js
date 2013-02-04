var lib = require('./lib');

exports.sleeprecord = {
  id: function(data) {
    return lib.datetimeToId(data.bedTime);
  },
  at: lib.getTimeFromStartDate
};

exports.sleepstat = {
  id: function(data) {
    return lib.datetimeToId(data.bedTime);
  },
  at: lib.getTimeFromStartDate
};

exports.defaults = {
  self: 'profile',
  sleep_stats: 'sleepstat',
  sleep_records: 'sleeprecord',
  zq_scores: 'zqscore'
};
