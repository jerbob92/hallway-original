var lib = require('./lib.js');

exports.sync = function(pi, cb) {
  var since = pi.config.fitnessSince || '0000-00-00';
  lib.getData({query: "fitnessActivities",
    type:"FitnessActivityFeed",
    since:since,
    token:pi.auth.token.access_token
  }, function(err, fitnessActs) {
    if (err || !fitnessActs) return cb(err);
    var data = {};
    data['activity:'  +  pi.auth.pid + '/fitness_activities'] = fitnessActs;
    var photos = data['photo:' + pi.auth.pid + '/photos'] = [];
    fitnessActs.forEach(function(activity){
      if (activity.images) activity.images.forEach(photos.push);
    });
    pi.config.fitnessSince = (new Date()).toISOString().substr(0,10);
    cb(err, {
      data:data,
      config:pi.config
    });
  });
};
