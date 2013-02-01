var path = require('path');
var lib = require(path.join(__dirname, 'lib'));

exports.sync = function (pi, callback) {

  // call the albums apis
  var params = {
    'method' : 'smugmug.albums.get',
    'Heavy' : true
  };

  lib.apiCall('GET', pi.auth, params, true, function(error, data) {

    // error getting the albums
    if(error) {
      return callback(error);
    }

    // no Albums element
    if(!data || !data.Albums) {
      return callback(new Error("missing albums"));
    }

    // store the albums
    pi.data = {};
    pi.data['album:' + pi.auth.pid + '/albums'] = data.Albums;
    pi.config.lastAlbumsSync = Date.now();

    callback(null, pi);
  });
};
