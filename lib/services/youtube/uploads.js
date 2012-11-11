
var MAX_RESULTS = 50;
exports.sync = function(pi, callback) {
    var params = {'max-results':MAX_RESULTS};
    if(!pi.config.startIndex)
        pi.config.startIndex = 1;
    params['start-index'] = pi.config.startIndex;
    var now = Date.now();
    params.v = '2';
    getClient(pi.auth).getFeed('https://gdata.youtube.com/feeds/api/users/default/uploads', params, function(err, result) {
        if(!(result && result.feed) || err || result.error) {
            console.error('youtube BARF! err=', err, ', result=', result);
            return callback(err);
        }
        var responseObj = {data:{}, config:{startIndex: pi.config.startIndex}, auth:pi.auth};
        responseObj.data['video:'+pi.auth.pid+'/uploads'] = result.feed.entry;
        if(result.feed.entry && result.feed.entry.length > 0) {
            responseObj.config.startIndex += result.feed.entry.length;
            responseObj.config.nextRun = -1;
        } else {
            responseObj.config.startIndex = 1;
            responseObj.config.nextRun = 0;
        }
        return callback(null, responseObj);
    });
};

function getClient(auth) {
  var gdataClient = require('gdata-js')(auth.appKey || auth.clientID, auth.appSecret || auth.clientSecret, auth.redirectURI);
  gdataClient.setToken(auth.token);
  return gdataClient;
}
