var lib = require('./lib');

exports.sync = function(pi, cb) {
  var arg = {auth:pi.auth};
  var data = {};
  arg.changes = data['change:' + pi.auth.pid + '/changes'] = [];
  arg.newest = pi.config.changestamp || 0;
  page(arg, function(err, runAgain) {
    var newConfig = {
      changestamp: arg.newest
    };

    if (runAgain) newConfig.nextRun = -1;

    cb(err, {
      data   : data,
      config : newConfig
    });
  });
};

function page(arg, callback) {
  var url = 'https://docs.google.com/feeds/default/private/changes' +
            '?alt=json&access_token=' + arg.auth.token.access_token +
            '&v=3&start-index=' + (arg.newest + 1);

  lib.get(arg.auth, {uri:url, json:true}, function(err, resp, body){
    if (err || !body || !body.feed || !body.feed.entry ||
        !Array.isArray(body.feed.entry) || body.feed.entry.length === 0) {
      return callback(err);
    }

    var last = arg.newest;
    body.feed.entry.forEach(function(e){
      if (e.docs$changestamp && e.docs$changestamp.value &&
          e.docs$changestamp.value > arg.newest) {
        arg.newest = parseInt(e.docs$changestamp.value, 10); // track the newest
      }
      arg.changes.push(e);
    });

    return callback(null, last !== arg.newest);
  });
}
