var lib = require('./lib');

exports.sync = function(pi, cb) {
  var url = 'accounts/' + pi.auth.account + '/files' +
            '?limit=500&file_name=' + encodeURIComponent('/.jpe?g$/') +
            '&from=' + encodeURIComponent(pi.auth.email);
  lib.fetch(pi.auth, url, function(err, js) {
    if (err) return cb(err);
    if (!js || !Array.isArray(js)) {
      return cb(new Error("invalid/missing data"));
    }
    var data = {};
    data['afile:' + pi.auth.pid + '/photos'] = js;
    cb(null, {data:data});
  });
};
