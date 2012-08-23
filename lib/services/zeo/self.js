var lib = require('./lib.js');

exports.sync = function(pi, cb) {
  var auth = pi.auth;
  auth.profile = null;
  lib.apiCall({auth:pi.auth, query:'/getEarliestSleepRecord'}, function(err, record, resp){
    if (err) return cb(new Error('status code ' + err.statusCode));
    if (!record || !record.response) return cb(new Error("unknown ZEO response "+record));
    var datetime = record.response.sleepRecord.bedTime;
    lib.datetimeToID(datetime, function(err, id){
      if (err) cb(new Error('Could not create pid'));
      auth.pid = id+'@zeo';
      var base = 'profile:'+auth.pid+'/self';
      var data = {};
      data[base] = [{id: auth.pid}];
      cb(null, {auth:auth, data:data});
    });
  });
}
