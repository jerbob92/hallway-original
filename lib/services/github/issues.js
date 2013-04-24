var async = require('async');
var request = require('request');
var _ = require('underscore');
var API_BASE = 'https://api.github.com/issues';

exports.sync = function(pi, cb) {
  function getIssues(type, callback) {
    var req = {
      url: API_BASE,
      qs: {access_token: pi.auth.accessToken, filter: type},
      json: true,
      headers:{"User-Agent":"singly.com"}
    };
    request.get(req, function(err, resp, body) {
      if (err || !body) return callback(err);

      // it's ok, the user just doesn't have any issues
      if (resp.statusCode === 404 ||
          !Array.isArray(body)) return callback();

      callback(null, body);
    });
  }

  async.series([
    getIssues.bind(null, 'assigned'),
    getIssues.bind(null, 'created'),
    getIssues.bind(null, 'mentioned'),
    getIssues.bind(null, 'subscribed')
  ],
  function(err, results) {
    if (err || !results)
      return cb(err);

    var base = 'issues:' + pi.auth.pid + '/issues';
    var data = {};

    data[base] = _.reduce(results, function(a, b) {
      if (!a) return b;
      if (b) return a.concat(b);
    }, []);

    cb(null, { data: data });
  });
};
