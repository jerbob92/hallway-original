var gdata = require('gdata-js');

exports.sync = function (pi, callback) {
  gdata.clientFromAuth(pi.auth).getFeed('http://gdata.youtube.com/feeds/api/users/default',
    { v: '2' }, function (err, result) {
    if (!result ||
      !result.entry ||
      !result.entry.yt$userId ||
      !result.entry.yt$userId.$t ||
      err ||
      result.error) {
      console.error('youtube BARF! err=', err, ', result=', result);

      return callback(err);
    }

    pi.auth.profile = result.entry;
    pi.auth.pid = result.entry.yt$userId.$t + '@youtube';

    var base = 'profile:' + pi.auth.pid + '/self';
    var data = {};

    data[base] = [result.entry];

    callback(null, { auth: pi.auth, data: data });
  });
};
