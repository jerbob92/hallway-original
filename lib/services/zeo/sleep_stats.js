var lib = require('./lib.js');
var util = require('util');

var ZEO_SUCCESS = '0';

exports.sync = function(pi, cb) {
  pi.config = pi.config || {};
  lib.apiCall({auth:pi.auth, query:'/getLatestSleepStats'}, function(err, body, resp){
    if (!body || !body.response || body.response.value) return cb(new Error('Missing response json'));
    body = body.response;
    if (err) return cb(new Error('status code ' + err.statusCode));
    var stat = body.sleepStats;
    if (stat) {
      var statsArray = [];
      statsArray.push(stat);
      addStatsBefore(statsArray, stat.startDate, pi, cb);
    } else {
      cb(null);
    } 
  });
};


//Recursively backtrack until reach since
function addStatsBefore(statsArray, date, pi, cb) {
  lib.apiCall({auth:pi.auth, query:'/getPreviousSleepStats', 
      params: {date: date.year + '-' + date.month + '-' + date.day}}, function(err, body){
    if (err) return cb(new Error('status code ' + err.statusCode));
    if (!body || !body.response || body.response.value) return cb(new Error('Missing response json'));
    body = body.response;
    var stat = body.sleepStats;
    if (!stat || stat.startDate === pi.config.since) {
      syncSleepStats(statsArray, pi, cb);
    } else {
      addStatsBefore(statsArray, stat.startDate, pi, cb);
    }
  });
}

function syncSleepStats(statsArray, pi, cb) {
  var data = {};
  pi.config.since = statsArray[0].startDate;
  data['sleepstat:'+pi.auth.pid+'/sleep_stats'] = statsArray;
  cb(null, {data:data, config:pi.config});
}


