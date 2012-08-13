var lib = require('./lib.js');


exports.sync = function(pi, cb) {
  lib.apiCall({auth:pi.auth, query:'getLatestSleepStats'}, function(err, body){
    var stat = body.sleepStats;
    var statsArray = [];
    statsArray.push(stat);
    if (body.status === "0") {
      addStatsBefore(statsArray, stat.startDate, pi, cb);
    } else {
      syncSleepStats(statsArray, pi, cb);
    }
  });
};

function addStatsBefore(statsArray, date, pi, cb) {
  lib.apiCall({auth:pi.auth, query:'getPreviousSleepStats', params: {dat: date.year + '-' +
                                  date.month + '-' + date.day}}, function(err, body){
    var stat = body.sleepStats;
    stats.Array.push(stat);
    if (body.status === "0" || stat.startDate === pi.config.since) {
      addStatsBefore(statsArray, stat.startDate, pi, cb);
    } else {
      syncSleepStats(statsArray, stat.startDate, pi, cb);
    }
  });
}

function syncStatsArray(statsArray, since, pi, , cb) {
  var data = {};
  pi.config.since = since;
  data['sleepStats:'+pi.auth.pid+'/sleepStats'] = statsArray;
  cb(err, {data:data, config:pi.config};
}


