var requestClient = require('request');

exports.getRequest = function(auther, auth, callback) {
  var req = requestClient(auther(auth)).on('response', function(res) {
    if (res.statusCode !== 401) return callback(req);
    tryRefresh(auth, function(err, auth){
      if(err) return callback(err);
      // try again once more
      req = requestClient(auther(auth)).on('response', function(res) {
        return callback(req, auth);
      });
    });
  });
};

//function from gdocs/gcal lib
function tryRefresh(auth, callback) {
  var options = {
    uri: 'https://accounts.google.com/o/oauth2/token',
    method: 'POST',
    form: {
      client_id:auth.appKey || auth.clientID,
      client_secret:auth.appSecret || auth.clientSecret,
      refresh_token:auth.token.refresh_token,
      grant_type:'refresh_token'
    }
  };
  requestClient(options, function(err, res, body){
    var js;
    try {
      if(err) throw err;
      js = JSON.parse(body);
    } catch(E) {
      return callback(E);
    }
    auth.token.access_token = js.access_token;
    return callback(null, auth);
  });
}
