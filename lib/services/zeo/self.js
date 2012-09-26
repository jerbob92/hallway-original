var lib = require('./lib');

exports.sync = function(pi, cb) {
  var auth = pi.auth;

  auth.profile = null;

  lib.apiCall({ auth: auth, query: '/getAccountId' },
    function(err, body) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode));
    }

    if (!body || !body.response || !body.response.value) {
      return cb(new Error('Missing response JSON'));
    }

    auth.pid = body.response.value + '@zeo';

    var base = 'profile:' + auth.pid + '/self';
    var data = {};

    data[base] = [{ id: auth.pid }];

    cb(null, { auth: auth, data: data });
  });
};
