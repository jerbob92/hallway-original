var request = require('request');
var path = require('path');
var url = require('url');
var lib = require(path.join(__dirname, 'lib'));

exports.sync = function(pi, callback) {

  var params = {
    'method' : 'smugmug.users.getInfo',
    'NickName' : pi.auth.nickname
  };
  lib.apiCall('GET', pi.auth, params, true, function(error, data) {

    // if error is the expired error from yahoo
    if(error && error.statusCode === 401) {
      return lib.refreshToken(exports.sync, pi, callback);
    } else if (error) {
      return callback(error);
    }

    if(!data || !data.User || !data.User.NickName) {
      return callback(new Error("missing user or nickname"));
    }

    // get the profile, must have an id field
    var user = data.User;
    var userId = pi.auth.id;
    user.id = userId;
    var base = 'profile:' + userId + '@smugmug/self';
    pi.auth.profile = user;
    pi.auth.pid = userId + '@smugmug';

    var selfData = {};
    selfData[base] = [user];
    callback(null, {
      auth: pi.auth,
      data: selfData
    });
  });
};