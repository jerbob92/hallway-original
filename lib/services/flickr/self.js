var OAlib = require('oauth').OAuth;
var querystring = require('querystring');
  
exports.sync = function(pi, cb) {
  var oa = new OAlib('http://www.flickr.com/services/oauth/request_token'
   , 'http://www.flickr.com/services/oauth/access_token'
   , pi.auth.consumerKey
   , pi.auth.consumerSecret
   , '1.0'
   , null
   , 'HMAC-SHA1'
   , null
   , {'Accept': '*/*', 'Connection': 'close'});
  
  // First, call check token to grab their ID
  oa.getProtectedResource('http://api.flickr.com/services/rest/?format=json&nojsoncallback=1&method=flickr.auth.oauth.checkToken', 
  		"GET", pi.auth.token, pi.auth.tokenSecret,
  		function (err, data, response) {
  		  if (err) {
  		    return cb(err);
  		  }
  		  data = JSON.parse(data);
        
        // Then get all the user info about them
        oa.getProtectedResource('http://api.flickr.com/services/rest/?format=json&nojsoncallback=1&method=flickr.people.getInfo&user_id=' + data.oauth.user.nsid, 
        		"GET", pi.auth.token, pi.auth.tokenSecret,
        		function (err, data, response) {
              if (err) {
        		    return cb(err);
        		  }
        		
        		  data = JSON.parse(data);
        		  
        		  if (response.statusCode != 200 || !data || !data.person.id) {
        		    return cb(response.statusCode + ': ' + JSON.stringify(data))
        		  }
        		  var me = data.person;
              pi.auth.pid = encodeURIComponent(me.id) + '@flickr';
              pi.auth.profile = me;
              var data = {};
              console.log(require('util').inspect(me, false, null));
              console.log(require('util').inspect(pi.auth, false, null));
              data['profile:' + pi.auth.pid + '/self'] = [me];
              cb(null, {data: data, auth: pi.auth});
        		});
  		});
}