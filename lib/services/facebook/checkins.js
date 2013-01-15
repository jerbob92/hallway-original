var fb = require('./lib.js');

exports.sync = function(pi, cb) {
  var resp = {data: {}};
  var since = pi.config.since || 0;
  var checkins = resp.data['post:'+pi.auth.pid+'/checkins'] = [];
  fb.getCheckins({
    id          : "me",
    accessToken : pi.auth.accessToken,
    since       : since
  },function(post){
    if(!post.type) post.type="checkin";
    checkins.push(post);
    if(post.created_time > since) since = post.created_time;
  },function(err) {
    resp.config = {since: since};
    cb(err, resp);
  });
};
