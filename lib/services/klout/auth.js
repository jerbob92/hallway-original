module.exports = {
  handler : function (callback, apiKeys, done, req, res) {
    var request = require('request');
    var qs = require('url').parse(req.url, true).query;

    // second phase, post-user-authorization
    if(qs && qs.authCode) {
      var query = {
        apiKey   : apiKeys.appKey,
        authCode : qs.authCode,
        user     : qs.user,
        redirect : callback
      };
      query.apiSig = require('crypto').createHash('md5').update(
        [
          apiKeys.appKey,
          apiKeys.appSecret,
          Math.floor(Date.now()/10000).toString()
        ].join('')
      ).digest('hex');
      console.error("sending", query);
      request.get("https://api.klout.com/v2/oauth/token", {
        qs:query,
        json:true
      }, function(err, res, body){
        if(err) return done("Couldn't fetch token: " + err);
        if(res.statusCode !== 200) return done("Error from Klout: " + body);
        done(null, {
          accessToken  : body,
          clientID     : apiKeys.appKey,
          clientSecret : apiKeys.appSecret,
          user         : qs.user
        });
      });
      return;
    }

    // first phase, initiate user authorization
    res.redirect('https://api.klout.com/v2/oauth/' +
                 '?apiKey=' + apiKeys.appKey +
                 '&redirect=' + callback);
  }
};
