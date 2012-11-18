var request = require('request');

exports.sync = function(pi, cb) {
  console.log(pi);
  // TODO: Split this URL out into a base and endpoints if/when we add more
  request.get('https://identity.x.com/xidentity/resources/profile/me', {
    qs: {
      oauth_token: pi.auth.accessToken
    },
    json: true
  }, function(err, response, profile) {
    if (err) return cb(err);

    console.warn(profile);

    pi.auth.profile = profile;
    pi.auth.pid = profile.identity.userId + '@paypal';

    var base = 'contact:' + pi.auth.pid + '/self';
    pi.data = {};
    pi.data[base] = [profile];

    cb(null, pi);
  });
};
