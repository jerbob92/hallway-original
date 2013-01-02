var path     = require('path');
var linkedin = require(path.join(__dirname, 'lib.js'));

function postStatus(data, callback) {
  linkedin.post('people/~/shares', {
    auth: data.auth,
    comment: data.body,
    visibility: {
      code: 'anyone'
    }
  }, function(err, body, response) {
    if (err) return callback(null, {error: body.message});

    // LinkedIn returns an HTTP 201 Created with a reference to the status in
    // the Location header, though the URL there isn't actually accessible.
    // If there was a 201, but no Location, it means LinkedIn decided your
    // post was a duplicate. Their heuristic appears to check that it's the
    // same text as something posted in the last 10 minutes.
    var result = {};
    if (response.statusCode === 201) {
      if (response.headers.location) {
        result.location = response.headers.location;
      } else {
        result.error = 'Duplicate status message.';
      }
    } else {
      result.error = 'Unexpected response: HTTP ' + response.statusCode;
    }

    callback(null, result);
  });
}

module.exports = {
  statuses: postStatus
};
