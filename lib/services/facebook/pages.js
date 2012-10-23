var fb = require('./lib.js');

exports.sync = function(pi, callback) {
  var base = 'page:' + pi.auth.pid + '/pages';
  var resp = {data: {}};
  var pages = resp.data[base] = [];
  fb.getAdministeredPages({
    accessToken: pi.auth.accessToken
  }, function(page) {
    pages.push(page);
  }, function(err) {
    callback(err, resp);
  });
};
