var request = require('request');

exports.sync = function(pi, cb) {
  request.get({
    uri     : 'https://api.klout.com/v2/user.oauth/' + pi.auth.user + '/topics',
    headers : {authorization: 'Bearer ' + pi.auth.accessToken},
    json    : true
  }, function(err, resp, topics){
    if(err) return cb(err);
    if(resp.statusCode !== 200 || !Array.isArray(topics)) {
      return cb(resp.statusCode + ': ' + JSON.stringify(topics));
    }
    var data = {};
    data['topic:' + pi.auth.pid + '/topics'] = topics;
    cb(null, {data:data});
  });
};
