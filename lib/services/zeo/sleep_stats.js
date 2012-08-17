var lib = require('./lib.js');
var util = require('util');

var ZEO_SUCCESS = '0';

exports.sync = function(pi, cb) {
  pi.config = pi.config || {};
  lib.apiCall({auth:pi.auth, query:'/getLatestSleepStats'}, function(err, body, resp){
    if (err) return cb(new Error('status code ' + err.statusCode));
    if (!body || !body.response || !body.response.sleepStats) return cb(new Error('Missing response json'));
    var stat = body.response.sleepStats;
    if (!stat.startDate) return cb(new Error('Missing required date field'));
    var statsArray = [];
    statsArray.push(stat);
    addStatsBefore(statsArray, stat.startDate, pi, cb);
  });
};


//Recursively backtrack until reach since
function addStatsBefore(statsArray, date, pi, cb) {
  lib.apiCall({auth:pi.auth, query:'/getPreviousSleepStats', 
      params: {date: date.year + '-' + date.month + '-' + date.day}}, function(err, body){
    if (err) return cb(new Error('status code ' + err.statusCode));
    if (!body || !body.response) return cb(new Error('Missing response json'));
    var stat = body.response.sleepStats;
    if (!stat || stat.startDate === pi.config.since) {
      syncSleepStats(statsArray, pi, cb);
    } else {
      statsArray.push(stat);
      addStatsBefore(statsArray, stat.startDate, pi, cb);
    }
  });
}

function syncSleepStats(statsArray, pi, cb) {
  pi.data = {};
  pi.config.since = statsArray[0].startDate;
  pi.data['sleepstat:'+pi.auth.pid+'/sleep_stats'] = statsArray;
  return cb(null, pi);
}


