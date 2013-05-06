var fb = require('./lib.js');

exports.sync = function(pi, cb) {
  var arg = pi.auth;
  arg.id = pi.id;
  fb.getId(arg, cb);
};
