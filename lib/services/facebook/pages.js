var fb = require('./lib.js');

exports.sync = function(pi, callback) {
  if (!pi.config) pi.config = {};

  var uri;
  if (pi.config.next) uri = pi.config.next;
  else uri = fb.apiUrl(pi.auth, '/me/accounts', {type: 'page'});

  fb.getPage(uri, function(err, pages) {
    if (err) return callback(err);

    var resp = {
      data: {},
      config: pi.config
    };
    resp.data['page:' + pi.auth.pid + '/pages'] = pages.data;

    if (pages.data.length > 0 && pages.paging && pages.paging.next) {
      resp.config.next = pages.paging.next;
      resp.config.nextRun = -1;
    } else {
      resp.config.next = null;
    }

    callback(null, resp);
  });
};
