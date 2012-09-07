var async  = require('async');
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

  var body = req.param('body');
  var url = req.param('url');

  if (typeof(body) !== 'string' || body.match(/^\s*$/)) return res.json(
    lutil.jsonErr('Must include a "body" parameter'), 400
  );

  logger.info('Posting ' + type + ' to ', services);


  acl.getApp(req._authsome.app, function(err, appData) {
    // async.forEach's final callback receives an error, but using it will halt
    // the sequence. Instead, pass an object back with an `error` key for display
    // to the user.
    var responses = {};
    async.forEach(services, function(service, callback) {
      // awe.sm is a pass-thru if no key
      var params = (req.query.awesm_key ? req.query : req.body); // be flexible
      delete params.access_token; // don't expose our token
      var awesm_key = params.awesm_key;
      preAwesm(awesm_key, service, req.param('tool'), url, params, function(url, awesm_id, awesm_body){
        body = body.replace(req.param('url'), url); // swap out url in the body if it got replaced
        postToService(req, appData, {
          service: service,
          type: type,
          body: body
        }, function(err, response) {
          responses[service] = response;
          callback(err);
          // in background ping back
          if(awesm_key) postAwesm(awesm_key, awesm_id, req.param('tool'), service, "tbd", 0);
        });
      });
    }, function(err) {
      res.json(responses);
    });
  });
};

initPostMap();

// pass through if no awe.sm key, otherwise shunt through them to get a modified url and id
function preAwesm(key, channel, tool, url, params, callback)
{
  if(!key) return callback(url);
  var form = params;
  form.v = "3";
  form.tool = tool || "SQidx3";
  form.key = key;
  form.channel = channel;
  form.url = url;
  request.post({uri:"https://api.awe.sm/url.json", form:form}, function(err, resp, body){
    if(err) logger.warn("awesm error",err);
    try {
      body = JSON.parse(body);
    }catch(E){}
    if(!body || !body.awesm_id) logger.warn("awesome bad body",typeof body,body);
    if(!body || !body.awesm_id) return callback();
    callback(body.awesm_url, body.awesm_id, body);
  });
}

function postAwesm(key, awesm_id, tool, channel, postid, reach)
{
  var form = {};
  form.v = "3";
  form.tool = tool || "SQidx3";
  form.key = key;
  form.service_postid = [channel,postid].join(':');
  form.service_postid_reach = reach || 0;
  request.post({uri:"https://api.awe.sm/url/update/"+awesm_id+".json", form:form}, function(){});
}
