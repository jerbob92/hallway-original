var lib = require('./lib');

function syncSleepStats(statsArray, pi, cb) {
  pi.data = {};
  pi.config.since = statsArray[0].startDate;
  pi.data['sleepstat:' + pi.auth.pid + '/sleep_stats'] = statsArray;

  cb(null, pi);
}

// Recursively backtrack until we reach pi.config.since
function addStatsBefore(statsArray, date, pi, cb) {
  lib.apiCall({ auth: pi.auth, query: '/getPreviousSleepStats',
    params: { date: date.year + '-' + date.month + '-' + date.day } },
    function(err, body) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode + ', body ' + body));
    }

    if (!body || !body.response) {
      return cb(new Error('Missing response JSON'));
    }

    var stat = body.response.sleepStats;

    if (!stat || stat.startDate === pi.config.since) {
      syncSleepStats(statsArray, pi, cb);
    } else {
      statsArray.push(stat);

      addStatsBefore(statsArray, stat.startDate, pi, cb);
    }
  });
}

exports.sync = function(pi, cb) {
  pi.config = pi.config || {};

  lib.apiCall({ auth: pi.auth, query: '/getLatestSleepStats' },
    function(err, body, resp) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode + ', body ' + body));
    }

    if (!body || !body.response || !body.response.sleepStats) {
      return cb(new Error('Missing response JSON'));
    }

    var stat = body.response.sleepStats;

    if (!stat.startDate) {
      return cb(new Error('Missing required date field'));
    }

    var statsArray = [];

    statsArray.push(stat);

    addStatsBefore(statsArray, stat.startDate, pi, cb);
  });
};
