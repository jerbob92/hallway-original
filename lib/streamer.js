var connect = require('connect');
var crypto = require('crypto');
var express = require('express');
var http = require('http');
var querystring = require('querystring');
var request = require('request');

var logger = require('logger').logger('stream');
var hostStatus = require('host-status').status;

var total;
var api;
var myself;
var master = {};

var stream = express();
var streamServer = http.createServer(stream);

var io = require('socket.io').listen(streamServer);

stream.use(connect.bodyParser());
stream.use(connect.cookieParser());

stream.use(function (req, res, next) {
  logger.debug("REQUEST %s", req.url);

  return next();
});

// enable CORS
stream.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With, Authorization");

  // intercept OPTIONS method
  if (req.method === 'OPTIONS') return res.send(200);

  next();
});

// Keep track of total hits, reported in /state
stream.use(function (req, res, next) {
  total++;

  next();
});

// where the push events get sent to!
stream.post('/stream/:id', function (req, res) {
  var id = req.params.id;
  if (!master[id]) return res.send(410);
  var client = master[id];
  if (client.socket.disconnected) {
    delete master[id];
    return res.send(410);
  }
  res.send(200);
  if (!Array.isArray(req.body)) return;
  req.body.forEach(function (entry) {
    client.socket.emit(id, entry);
  });
});

// public state information
stream.get('/state', function (req, res) {
  var ret = hostStatus();

  ret.total = total;

  res.json(ret);
});

io.sockets.on('connection', function (socket) {
  logger.debug('new client');
  socket.on('stream', function (arg, cb) {
    logger.debug("new stream request");

    var id = crypto.createHash('md5').update(
      Math.random().toString()).digest('hex');

    master[id] = {
      socket: socket,
      id: id,
      started: Date.now()
    };

    socket.on(id, function (req) {
      var token = req.access_token;
      var filter = api + req.path + '?' + querystring.stringify(req.query);
      var dest = myself + '/stream/' + id;
      logger.debug("generating new pushback", filter, dest);
      var push = {};
      push[filter] = {url: dest};

      request.post({
        uri: api + '/push/upsert',
        qs: {access_token: token},
        json: push
      }, function (err, resp, body) {
        if (err) logger.warn(err);
        if (resp && resp.statusCode !== 200) logger.warn(resp.statusCode, body);
      });
    });

    cb(id);
  });
});

exports.startService = function (arg, cb) {
  total = 0;

  api = arg.apihost;
  myself = arg.streamhost;

  stream.listen(arg.port, arg.listenIP, function () {
    cb(stream);
  });
};
