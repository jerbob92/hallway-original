var url = require('url');
var OAlib = require('oauth').OAuth;

exports.apiCall = function(httpMethod, auth, params, deserialize, callback) {

  var OA = new OAlib(
      null,
      null,
      auth.consumerKey,
      auth.consumerSecret,
      '1.0',
      null,
      'HMAC-SHA1',
      null,
      {'Accept': '*/*', 'Connection': 'close'}
    );

  // create the api url
  var apiUrlObj = url.parse(
    'https://api.smugmug.com/services/api/json/1.3.0/', true);
  for (var key in params) {
    apiUrlObj.query[key] = params[key];
  }
  var apiUrl = url.format(apiUrlObj);

  if (httpMethod == "GET") {

    // perform the api request with oauth
    OA.get(apiUrl, auth.token, auth.tokenSecret,
      function(error, body, response) {

        // return the error if one occured
        if (error) {
          return callback(error);
        }

        // parse the JSON body
        if (deserialize) {
          var data;
          try {
            data = JSON.parse(body);
          } catch(E) {
            return callback(new Error("couldn't parse response: " + body));
          }
          return callback(null, data, response);
        }
        else {
          return callback(null, body, response);
        }
      }
    );
  }
  else {
    return callback(new Error("Unsupported HTTP method"));
  }
};
