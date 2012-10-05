var request = require('request');

exports.sync = function(pi, cb) {
  request.get({uri:'https://api.klout.com/v2/user.oauth/'+pi.auth.user+'/influence', headers:{authorization:'Bearer '+pi.auth.accessToken}, json:true}, function(err, resp, influence){
    if(err) return cb(err);
    if(resp.statusCode != 200 || !influence || !Array.isArray(influence.myInfluencees)) return cb(resp.statusCode+': '+JSON.stringify(influence));
    var data = {};
    data['entity:'+pi.auth.pid+'/influencees'] = unwrap(influence.myInfluencees);
    data['entity:'+pi.auth.pid+'/influencers'] = unwrap(influence.myInfluencers);
    cb(null, {data:data});
  });
}

function unwrap(arr)
{
  var ret = [];
  arr.forEach(function(obj){ if(obj.entity) ret.push(obj.entity) });
  return ret;
}