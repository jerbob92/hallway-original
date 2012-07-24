var async  = require('async');
var logger = require('logger').logger("webservice");
var lutil  = require('lutil');
var path   = require('path');

var syncManager = require('syncManager');

var postMap = {};

function initPostMap() {
  syncManager.manager.getServices(function(err, services) {
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

function postToService(data, callback) {
  var service = data.service;
  var type = data.type;

  if (!postMap[service] || !postMap[service][type]) {
    return callback(null, {
      error: 'Can\'t post ' + type + ' to ' + service + '. Try using /proxy.',
      see: 'https://singly.com/proxy'
    });
  }

  postMap[service][type](data, callback);
}

exports.postType = function(req, res) {
  // Using split() on an empty string returns ['']. Rather than clean it, this
  // regex works more as expected.
  var services = (req.param('services') || '').match(/[^,]+/g) || [];

  if (services.length === 0) return res.json(
    // TODO: Reference documentation when it exists
    // https://github.com/Singly/hallway/issues/484
    lutil.jsonErr('Must include "services" parameter.'), 400
  );

  // async.forEach's final callback receives an error, but using it will halt
  // the sequence. Instead, pass an object back with an `error` key for display
  // to the user.
  var responses = {};
  async.forEach(services, function(service, callback) {
    postToService({
      service: service,
      type: req.param('type')
    }, function(err, response) {
      responses[service] = response;
      callback(err);
    });
  }, function(err) {
    res.json(responses);
  });
};

initPostMap();
