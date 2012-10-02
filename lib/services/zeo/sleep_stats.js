var lib = require('./lib');

var MAX_QUERIES = 10;

function syncSleepStats(statsArray, pi, cb) {
  if (statsArray.length >= MAX_QUERIES) {
    pi.config.nextRun = -1;
  }

  pi.data = {};

  if (statsArray.length > 0) {
    pi.config.sleepStatsSince = statsArray[statsArray.length - 1].startDate;
  }

  pi.data['sleepstat:' + pi.auth.pid + '/sleep_stats'] = statsArray;

  cb(null, pi);
}

function nextStat(statsArray, date, pi, cb) {
  lib.apiCall({ auth: pi.auth, query: '/getNextSleepStats',
    params: { date: date.year + '-' + date.month + '-' + date.day } },
    function(err, body) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode + ', body ' + body));
    }

    if (!body || !body.response) {
      return cb(new Error('Missing response JSON'));
    }

    var stat = body.response.sleepStats;

    if (!stat || statsArray.length >= MAX_QUERIES) {
      syncSleepStats(statsArray, pi, cb);
    } else {
      statsArray.push(stat);

      nextStat(statsArray, stat.startDate, pi, cb);
    }
  });
}

exports.sync = function(pi, cb) {
  pi.config = pi.config || {};

  lib.apiCall({ auth: pi.auth, query: '/getEarliestSleepStats' },
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

    if (pi.config.sleepStatsSince) {
      stat.startDate = pi.config.sleepStatsSince;
    } else {
      statsArray.push(stat);
    }

    nextStat(statsArray, stat.startDate, pi, cb);
  });
};
