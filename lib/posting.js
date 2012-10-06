var async  = require('async');
var fs = require('fs');
var lutil  = require('lutil');
var path   = require('path');
var request = require('request');

var acl = require('acl');
var apiKeys = require('apiKeys');
var instruments = require('instruments');
var logger = require('logger').logger('posting');
var profileManager = require('profileManager');
var taskman    = require('taskman');

var postMap = {};

function initPostMap() {
  taskman.getServices(function(err, services) {
    Object.keys(services).forEach(function(service) {
      try {
        var servicePath = path.join('services', service, 'posting.js');
        postMap[service] = require(servicePath);
      } catch (E) {
        // That's ok, we just can't post there yet
      }
    });
  });
}

function postToService(req, app, data, callback) {
  var service = data.service;
  var type    = data.type;

  if (!postMap[service] || !postMap[service][type]) {
    return callback(null, {
      error: 'Sharing ' + type + ' is not supported to ' + service + '.' +
             ' Try using /proxy.',
      see: 'https://singly.com/proxy'
    });
  }

  if (!apiKeys.hasOwnKeys(app, service)) return callback(null, {
      error: 'You must use your own API keys to post to ' + service + '.' +
             ' Please add them to your app configuration.',
      see: 'https://singly.com/apps/' + app.app
    }
  );

  var pid;
  req._authsome.profiles.forEach(function(profile) {
    if (profile.profile.indexOf(service) >= 0) pid = profile.profile;
  });

  if (!pid) return callback(null, {error: 'No profile data for ' + service});

  profileManager.authGet(pid, req._authsome.app, function(err, auth) {
    data.auth = auth;
    var paramsName = service + '_params';
    var serviceParams = req.param(paramsName);
    if (serviceParams) {
      try {
        serviceParams = JSON.parse(serviceParams);
      } catch(E) {
        callback(null, {error: paramsName + ' must be JSON'});
      }
    }
    data[service + '_params'] = serviceParams;
    postMap[service][type](data, callback);
  });
}

function countPosts(req, type, services) {
  instruments.increment([
    'app.types.post.rollup',
    'app.types.post.type.rollup',
    'app.types.post.type.' + type,
    'app.' + req._authsome.app + '.types.post.rollup',
    'app.' + req._authsome.app + '.types.post.type.rollup',
    'app.' + req._authsome.app + '.types.post.type.' + type
  ]);

  services.forEach(function(service) {
    instruments.increment([
      'app.types.post.service.rollup',
      'app.types.post.service.' + service,
      'app.' + req._authsome.app + '.types.post.service.rollup',
      'app.' + req._authsome.app + '.types.post.service.' + service
    ]);
  });
}

// Pass through if no awe.sm key.
// Otherwise shunt through them to get a modified URL and ID
function preAwesm(key, channel, tool, url, params, callback) {
  if(!key) return callback(url);

  var form = params;
  form.v = "3";
  form.tool = tool || "SQidx3";
  form.key = key;
  form.channel = channel;
  form.url = url;

  request.post("https://api.awe.sm/url.json", {
    form: form
  }, function(err, resp, body){
    if (err) logger.warn("awesm error", err);
    try {
      body = JSON.parse(body);
    } catch (E) {
      // Pass
    }
    if (!body || !body.awesm_id) {
      logger.warn("awesome bad body", typeof body, body);
      return callback(err);
    }
    return callback(err, body.awesm_url, body.awesm_id);
  });
}

function postAwesm(key, awesmID, tool, channel, postID, reach) {
  var form = {};
  form.v = "3";
  form.tool = tool || "SQidx3";
  form.key = key;
  form.service_postid = [channel, postID].join(':');
  form.service_postid_reach = reach || 0;
  request.post("https://api.awe.sm/url/update/" + awesmID + ".json", {
    form:form
  }, function(err){
    if(err) console.warn("posting update to awesm failed", awesmID, err);
  });
}

exports.postType = function(req, res) {
  var type = req.param('type');

  // Using split() on an empty string returns ['']. Rather than clean it, this
  // regex works more as expected.
  var services = (req.param('services') || '').match(/[^,]+/g) || [];

  countPosts(req, type, services);

  if (services.length === 0) return res.json(
    // TODO: Reference documentation when it exists
    // https://github.com/Singly/hallway/issues/484
    lutil.jsonErr('Must include a "services" parameter.'), 400
  );

  var title = req.param('title');
  var body = req.param('body');
  var url = req.param('url');
  var photo = (req.files || {}).photo;

  if (type === 'statuses' && (typeof(body) !== 'string' || body.match(/^\s*$/))) {
    return res.json(lutil.jsonErr('Must include a "body" parameter'), 400);
  }

  if (type === 'photos' && !photo) {
    return res.json(lutil.jsonErr('Must include a "photo" parameter'), 400);
  }

  logger.info('Posting ' + type + ' to ', services);

  acl.getApp(req._authsome.app, function(err, appData) {
    // async.forEach's final callback receives an error, but using it will halt
    // the sequence. Instead, pass an object back with an `error` key for
    // display to the user.
    var responses = {};
    async.forEach(services, function(service, callback) {
      var profile;
      var parts = service.split('@');
      if (parts.length > 1) {
        profile = parts[0];
        service = parts[1];
      }
      // awe.sm is a pass-thru if no key
      var params = (req.query.awesm_key ? req.query : req.body); // be flexible
      delete params.access_token; // don't expose our token
      var awesmKey = params.awesm_key;
      var tool = req.param('tool');
      preAwesm(awesmKey, service, tool, url, params, function(err, awesmURL, awesmID) {
        // Swap out url in the body if it got replaced
        if (!err && awesmURL) body = body.replace(url, awesmURL);
        postToService(req, appData, {
          service: service,
          profile: profile,
          type: type,
          title: title,
          body: body,
          url: awesmURL || url,
          photo: photo
        }, function(err, response) {
          responses[service] = response;
          callback(err);
          // in background ping back
          if(awesmKey && typeof response === "object") {
            var id = "missing";
            // would be nice to use dMap somehow for this but the type-mapping more complicated than a couple if's right now
            if(service === 'twitter' && response.id_str) id = response.id_str;
            if(service === 'facebook' && response.id) id = response.id;
            postAwesm(awesmKey, awesmID, req.param('tool'), service, id, 0);
          }
        });
      });
    }, function(err) {
      res.json(responses);
    });
  });
};

initPostMap();

