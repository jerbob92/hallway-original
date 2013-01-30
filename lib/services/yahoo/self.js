var request = require('request');
var OAlib = require('oauth').OAuth;
var path = require('path');
var lib = require(path.join(__dirname, 'lib'));
var url = require('url');

exports.sync = function(pi, cb) {

  var OA = new OAlib(
      null,
      null,
      pi.auth.consumerKey,
      pi.auth.consumerSecret,
      '1.0',
      null,
      'HMAC-SHA1',
      null,
      {'Accept': '*/*', 'Connection': 'close'}
    );

  var profileUrlObj = url.parse(
    'http://social.yahooapis.com/v1/user/' + pi.auth.guid + '/profile', true);
  profileUrlObj.query['format'] = 'json';
  var profileUrl = url.format(profileUrlObj);

  OA.get(profileUrl, pi.auth.token, pi.auth.tokenSecret, function(err, body) {

    // if error is the expired error from yahoo
    if(err && err.statusCode === 401) {
      return lib.refreshToken(exports.sync, pi, cb);
    } else if(err) {
      return cb(err);
    }

    var js;
    try {
      js = JSON.parse(body);
    } catch(E) {
      return cb("couldn't parse response: " + body);
    }

    if(!js || !js.profile || !js.profile.guid) {
      return cb("missing profile or guid");
    }

    // get the profile, must have an id field
    var profile = js.profile;
    var profileId = js.profile.guid;
    profile.id = profileId;
    pi.auth.profile = profile; // stash
    pi.auth.pid = profileId + '@yahoo';

    var base = 'profile:' + profileId + '/self';
    var data = {};
    data[base] = [profile];

    cb(null, {
      auth: pi.auth,
      data: data
    });
  });
};