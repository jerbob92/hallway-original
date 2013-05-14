var url = require('url');
var request = require('request');

exports.sync = function(pi, cb) {
  var oauth = {
    consumer_key    : pi.auth.consumerKey,
    consumer_secret : pi.auth.consumerSecret,
    token           : pi.auth.token,
    token_secret    : pi.auth.tokenSecret
  };
  var uri = url.parse('http://api.flickr.com/services/rest');
  uri.query = {method:"flickr.photos.getInfo", format:"json", nojsoncallback:"1"};
  uri.query.photo_id = pi.id;
  // trying to mirror everything needed from orig req
  var arg = {method: "GET", oauth: oauth, json:true};
  arg.uri = url.format(uri);
  request(arg, function(err, resp, js){
    if(err) return cb(err);
    if(resp.statusCode !== 200) {
      return cb(
        new Error("status code " + resp.statusCode + " " + util.inspect(js))
      );
    }
    if(!js || !js.photo) {
      return cb(new Error("missing valid response: " + util.inspect(js)));
    }
    // since their api doesn't support &extras here have to fake the same response as paging!!#@^%@$!
    js.photo.url_t = [
      "http://farm", js.photo.farm,
      ".staticflickr.com/", js.photo.server,
      "/", js.photo.id,
      "_", js.photo.secret,
      "_t.jpg"
    ].join("");
    js.photo.url_l = [
      "http://farm", js.photo.farm,
      ".staticflickr.com/", js.photo.server,
      "/", js.photo.id,
      "_", js.photo.secret,
      "_b.jpg"
    ].join("");    
    cb(null, js.photo);
  });
};
