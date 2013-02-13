var logger  = require('logger').logger('pod');
var express = require('express');

var acl        = require('acl'); // Inited by hallwayd
var lconfig    = require('lconfig');
var middleware = require('api-host/middleware');

var pod = express();

function authorize(user, pass) {
  var auth = lconfig.podService && lconfig.podService.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

pod.use(express.basicAuth(authorize));
pod.use(middleware.addErrorFns);

exports.startService = function(port, ip, callback) {
  pod.listen(port, ip, function() {
    logger.info(
      'Pod at ' + ip + ':' + port,
      'putting itself to the fullest possible use,',
      'which is all I think that any conscious entity can ever hope to do.');
    callback();
  });
};
