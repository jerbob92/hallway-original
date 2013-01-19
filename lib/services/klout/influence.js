var request = require('request');

var KLOUT_API_BASE = 'https://api.klout.com/v2/user.oauth/';

exports.sync = function(pi, cb) {
  request.get({
    uri     : KLOUT_API_BASE + pi.auth.user + '/influence',
    headers : {authorization:'Bearer ' + pi.auth.accessToken},
    json    : true
  }, function(err, resp, influence){
    if (err) return cb(err);
    if (resp.statusCode !== 200 || !influence ||
       !Array.isArray(influence.myInfluencees)) {
      return cb(resp.statusCode + ': ' + JSON.stringify(influence));
    }
    var data = {};
    var base = 'entity:' + pi.auth.pid;
    data[base + '/influencees'] = unwrap(influence.myInfluencees);
    data[base + '/influencers'] = unwrap(influence.myInfluencers);
    cb(null, {data:data});
  });
};

function unwrap(arr) {
  var ret = [];
  arr.forEach(function(obj){
    if (obj.entity) ret.push(obj.entity);
  });
  return ret;
}
