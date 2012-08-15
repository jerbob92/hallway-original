var lib = require('./lib.js');

exports.sync = function(pi, cb) {
  var auth = pi.auth;
  auth.profile = null;
  lib.apiCall({auth:pi.auth, query:'/getEarliestSleepRecord'}, function(err, record, resp){
    var datetime = record.response.sleepRecord.bedTime;
    if (err) return cb(new Error('status code ' + err.statusCode));
    lib.datetimeToID(datetime, function(err, id){
      if (err) cb(new Error('Could not create pid'));
      auth.pid = id+'@zeo';
      var base = 'contact:'+auth.pid+'/self';
      var data = {};
      data[base] = {id: auth.pid};
      cb(null, {auth:auth, data:data});
    });
  });
}
