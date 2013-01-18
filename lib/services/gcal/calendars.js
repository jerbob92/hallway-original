var lib = require("./lib");

exports.sync = function(pi, cb) {
  var arg = {auth:pi.auth};
  var data = {};
  arg.cals = data['calendar:'+pi.auth.pid+'/list'] = [];
  page(arg, function(err){
    console.error(data);
    cb(err, {data : data, auth: pi.auth});
  });
};

function page(arg, callback) {
  var url = "https://www.googleapis.com/calendar/v3/users/me/calendarList" +
            "?key=" + arg.auth.appKey;
  if (arg.pageToken) url += "&pageToken="+arg.pageToken;
  lib.get(arg.auth, {uri:url}, function(err, resp, body){
    if (err || !body || !body.items ||
        !Array.isArray(body.items) || body.items.length === 0) {
      return callback(err);
    }
    body.items.forEach(function(e){
      arg.cals.push(e);
    });
    if (!body.nextPageToken) return callback(); // all done
    // loop until all pages are done
    arg.pageToken = body.nextPageToken;
    page(arg, callback);
  });
}
