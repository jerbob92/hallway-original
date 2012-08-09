var crypto = require('crypto');
var lib = require('./lib.js');

exports.sync = function(pi, cb) {
  var auth = pi.auth;
  auth.profile = null;
  auth.pid = crypto.createHash('md5').update(auth.token).digest('hex')+'@zeo';
  var base = 'contact:'+auth.pid+'self/';
  var data = {base:null};
  lib.getData({auth:auth, query:'getOverallAverageZQScore'});
  //cb(null, {auth:auth, data:data});
}
