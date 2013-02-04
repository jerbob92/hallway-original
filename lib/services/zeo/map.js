var lib = require('./lib');

exports.sleeprecord = {
  id: lib.getIDFromBedTime,
  at: lib.getTimeFromStartDate
};

exports.sleepstat = {
  id: lib.getIDFromBedTime,
  at: lib.getTimeFromStartDate
};

exports.defaults = {
  self: 'profile',
  sleep_stats: 'sleepstat',
  sleep_records: 'sleeprecord',
  zq_scores: 'zqscore'
};
