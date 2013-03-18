var connect = require('connect');
var express = require('express');

var dal = require('dal');
var hostStatus = require('host-status').status;
var logger = require('logger').logger('worker');
var taskmanNG = require('taskman-ng');

var worker = exports.api = express();

worker.use(connect.bodyParser());
worker.use(connect.cookieParser());

worker.get('/', function (req, res) {
  var ret = hostStatus();

  var cnt = 0;
  var tot = 0;

  var taskmanStats = taskmanNG.stats();

  taskmanStats.last.forEach(function (task) {
    cnt++;

    tot += (task.tdone - task.tstart);
  });

  ret.runtime = (tot / cnt) / 1000;

  ret.entries = taskmanStats.total;
  ret.workers = taskmanStats.workers;
  ret.total = taskmanStats.tasks;
  ret.active = Object.keys(taskmanStats.workers).length;

  res.json(ret);
});

// public health check
worker.get('/enoch', function (req, res) {
  var good = req.query['true'] || true;
  var bad = req.query['false'] || false;
  if (req.query.fail) return res.json(bad, 500);
  dal.query('select true', [], function (err, row) {
    if (err) return res.json(bad, 500);
    if (!row || !row[0] || row[0].TRUE !== 1) return res.json(bad, 500);
    res.json(good);
  });
});

// quick peak at global backlog
worker.get('/backlog', function (req, res) {
  taskmanNG.backlog(function (data) {
    res.json(data);
  });
});

// error handling
// XXX: 'next' must stay because connect checks for fn.length > 3!
worker.use(function (err, req, res, next) {
  if (err.stack) logger.error(err.stack);
  res.json(err, 500);
});

exports.startService = function (port, ip, cb) {
  worker.listen(port, ip, function () {
    logger.vital('Worker status is now listening at ' + ip + ':' + port);

    cb(worker);
  });
};
