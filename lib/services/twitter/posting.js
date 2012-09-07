var path    = require('path');
var twitter = require(path.join(__dirname, 'twitter_client.js'));

function statuses(data, callback) {
  var client = twitter(data.auth.consumerKey, data.auth.consumerSecret);
  client.apiCall('POST', '/statuses/update.json', {
    token: data.auth.token,
    json: true,
    status: data.body
  }, function(err, response) {
    if (err) {
      err = JSON.parse(err.data).error;
      return callback(null, {error: err});
    }
    return callback(null, response);
  });
}

module.exports = {
  statuses: statuses,
  links: statuses
};
