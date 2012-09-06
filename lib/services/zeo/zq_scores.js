var lib = require('./lib');

exports.sync = function(pi, cb) {
  lib.apiCall({ auth: pi.auth, query: '/getOverallAverageZQScore' },
    function(err, body, resp) {
    if (err) {
      return cb(new Error('Status code ' + err.statusCode + ', body ' + body));
    }

    if (!body || !body.response || !body.response.value) {
      return cb(new Error('Missing response JSON'));
    }

    var now = new Date();

    var zqScore = [{
      id: now.toDateString(),
      date: now.toJSON(),
      overallAverageZQScore: body.response.value
    }];

    pi.data = {};
    pi.data['zqscore:' + pi.auth.pid + '/zq_scores'] = zqScore;

    cb(err, pi);
  });
};
