var express = require('express');
var connect = require('connect');
var logger = require('logger').logger('dawg');
var async = require('async');
var crypto = require('crypto');
var urllib = require('url');
var authManager = require('authManager');
var syncManager = require('syncManager');
var profileManager = require('profileManager');
var ijod = require('ijod');
var pipeline = require('pipeline');
var dMap = require('dMap');
var acl = require('acl');
var idr = require('idr');
var instruments = require("instruments");
var lconfig = require('lconfig');
var dal = require('dal');
var alerting = require('alerting');
var request = require('request');
var serializer = require('serializer').createSecureSerializer(lconfig.authSecrets.crypt, lconfig.authSecrets.sign);

var airbrake;
var globals = {"ijodtotal":0,"ijodrate":0,"ijodlast":0};

// XXX: Make this dynamic
var workerArray = ['10.124.41.225:8041', '10.28.150.251:8041'];

function authorize(user, pass) {
  if(!lconfig.dawg || !lconfig.dawg.password) return false;
  var ret = 'dawg' === user & pass === lconfig.dawg.password;
  return ret;
}

var host = 'http://localhost:' + lconfig.dawg.port;

if (lconfig.dawg && lconfig.dawg.host) {
  host = lconfig.dawg.host;
}

var dawg = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    logger.debug("REQUEST %s", req.url);
    return next();
  },
  // enable CORS
  function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Authorization");

    // intercept OPTIONS method
    if (req.method === 'OPTIONS') {
      res.send(200);

      return;
    }

    next();
  },
  express.basicAuth(authorize)
);

dawg.use(express.static(__dirname + '/../static'));

dawg.get('/', function(req, res) {
  res.redirect(host + '/dawg.html');
});

dawg.get('/slag', function(req, res) {
  slag(function(err, ret){
    if(err) res.json(err, 500);
    slack(function(err, js){
      if(err) res.json(err, 500);
      ret.slack = js;
      res.json(ret);
    })
  })
});

dawg.get('/stats/ijod', function(req, res) {
  // calculated every 10min below
  res.json({count:globals.ijodtotal, rate:globals.ijodrate});
});

dawg.get('/profiles/syncing', function(req, res) {
  if(!req.query.q) return res.json("missing ?q=foo",500);
  dal.query("select * from SyncSchedule where `key` like ? limit 100", ['%'+req.query.q+'%'], function(err, ret){
    if(err) return res.json(err, 500);
    if(!ret || !ret[0]) return res.json([]);
    ret.forEach(function(row){ row.task = JSON.parse(row.task) });
    res.json(ret);
  });
});

function idhex(id) {return crypto.createHash('md5').update(id).digest('hex') }

dawg.get('/profiles/resync', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  dal.query("update Profiles set config = ? where id = ? limit 1", ['{}', req.query.pid], function(err, ret){
    if(err) return res.json(err, 500);
    // need to make this query better, explicit?
    dal.query("update SyncSchedule set nextRun = 0 where `key` like ? limit 10", [req.query.pid+'/%'], function(err, ret){
      if(err) return res.json(err, 500);
      logger.anubis(req,{act:idhex(req.query.pid), app:'singly'})
      res.json(true);
    });
  });
});

dawg.get('/profiles/get', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  profileManager.allGet(req.query.pid, function(err, ret){
    if(err) return res.json(err, 500);
    dal.query("select app, account from Accounts where profile = ?", [req.query.pid], function(err, apps){
      if(err) return res.json(err, 500);
      if(apps) apps.forEach(function(app){
        app.token = serializer.stringify([app.account, app.app, +new Date, null]);
      });
      ret.apps = apps;
      res.json(ret);
    });
  });
});

dawg.get('/profiles/note', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  if(!req.query.note) return res.json("missing ?note=this+is+my+note",500);
  logger.anubis(req,{act:idhex(req.query.pid), app:'singly', type:'note', note:req.query.note});
  res.json(true);
});

dawg.get('/profiles/notes', function(req, res) {
  var id = (req.query.pid) ? idhex(req.query.pid)+'@' : '';
  var base = 'logs:'+id+'singly/anubis';
  var ret = [];
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  ijod.getRange(base, options, function(item) { ret.push(item) }, function(err) {
    res.send(ret);
  });
});

dawg.get('/apps/get', function(req, res) {
  if(!req.query.key) return res.json("missing ?key=foo",500);
  dal.query("select * from Apps where app = ? or notes like ? limit 1", [req.query.key, '%'+req.query.key+'%'], function(err, ret){
    if(err) return res.json(err, 500);
    if(!ret || !ret[0]) return res.json([]);
    ret.forEach(function(row){
      if(row.notes) row.notes = JSON.parse(row.notes)
      if(row.apikeys) row.apikeys = JSON.parse(row.apikeys)
    });
    res.json(ret);
  });
});

dawg.get('/apps/logs', function(req, res) {
  if(!req.query.key) return res.json("missing ?key=foo",500);
  var base = 'logs:'+req.query.key+'/anubis';
  var ret = [];
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  options.q = req.query.q;
  ijod.getRange(base, options, function(item) { ret.push(item) }, function(err) {
    res.send(ret);
  });
});

function workerState(cb) {
  var backlog = 0;
  var active = 0;
  var workers = {};

  async.forEach(workerArray, function(ipp, cbForEach) {
    request.get({ uri: 'http://' + ipp, json: true }, function(e, r, js) {
      if (typeof js !== 'object') {
        return cbForEach();
      }

      workers[ipp] = js;

      backlog += js.backlog;
      active += js.active.length;

      cbForEach();
    });
  }, function() {
    cb({
      active: active,
      backlog: backlog,
      workers: workers
    });
  });
}

dawg.get('/workers/state', function(req, res) {
  workerState(function(state) {
    res.json(state);
  });
});

dawg.get('/links/:type', function(req, res) {
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.write('[');
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  options.q = req.query.q;
  var written = 0;
  ijod.getRange(req.params.type+':links/oembed', options, function(item) {
    if(written > 0) res.write(',');
    written++;
    // given the map flag, try to map any known fields
    res.write(JSON.stringify(item));
  }, function(err) {
    if(err) logger.error('error sending results for links:',err);
    return res.end(']');
  });
});

function activeApps(opt_since, cb) {
  var options = {
//    limit: 1,
    since: Date.now() - 86400000
  };

  if (parseInt(opt_since)) {
    options.since = parseInt(opt_since);
  }

  acl.getApps(function(err, all) {
    if(err || !all) {
      cb(err);

      return;
    }

    var count = 0;
    var total = 0;
    var hits = {};
    async.forEach(all, function(row, cbForEach) {
      ijod.getBounds('logs:'+row.app+'/anubis', options, function(err, bounds) {
        if(!bounds || bounds.total == 0) return cbForEach();
        count++;
        total += parseInt(bounds.total);
        hits[row.app] = parseInt(bounds.total);
        cbForEach();
      });
    }, function(){
      hits.total = total;
      cb(null, count, hits);
    })
  });
}

dawg.get('/apps/active', function(req, res) {
  activeApps(req.query.since, function(err, count) {
    if (err) {
      res.json(err, 500);
    } else {
      res.json(count);
    }
  });
});

dawg.get('/apps/hits', function(req, res) {
  activeApps(req.query.since, function(err, count, hits) {
    if (err) return res.json(err, 500);
    res.json(hits);
  });
});

// error handling
dawg.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  res.json(err, 500);
});

exports.startService = function(port, ip, cb) {
  dawg.listen(port, ip, function() {
    cb(dawg);
  });

  // minutelies
  setInterval(function() {
    slag(function(err, res) {
      if (err || typeof res !== 'object') {
        return;
      }

      instruments.gauge({
        'slag.count': res.cnt,
        'slag.lag': res.lag
      }).send();

      if (res.lag > 180) {
        alerting.alert("high slag of " + parseInt(res.lag) + " seconds", {
          details: {
            'slag count': res.cnt,
            'slag lag': res.lag
          },
          key: 'slag'
        });
      }
    });

    slack(function(err, res) {
      if (err || typeof res !== 'object') {
        return;
      }

      instruments.gauge({
        'slack.count': res.cnt,
        'slack.lag': res.lag
      }).send();
    });

    workerState(function(status) {
      if (typeof status !== 'object') {
        return;
      }

      instruments.gauge({
        'workers.active': status.active,
        'workers.backlog': status.backlog
      }).send();
    });

    activeApps(Date.now() - 300000, function(err, count) {
      if (err) {
        return;
      }

      instruments.gauge({
        'apps.active.5m': count
      }).send();
    });
  }, 60000);

  // 10-minutelys
  setInterval(function() {
    // this is expensive on innodb so do less frequently
    ijodcounter();

    activeApps(Date.now() - 86400000, function(err, count) {
      if (err) {
        return;
      }

      instruments.gauge({
        'apps.active.24h': count
      }).send();
    });
  }, 600000);

  ijodcounter();
};

function ijodcounter()
{
  dal.query("select count(*) as cnt from ijod", [], function(err, ret){
    if(err || !ret || !ret[0]) return;
    globals.ijodlast = globals.ijodtotal;
    globals.ijodtotal = parseInt(ret[0].cnt)
    if(globals.ijodlast > 0) globals.ijodrate = (globals.ijodtotal - globals.ijodlast) / 600;
  });
}

function slag(cb)
{
  dal.query("select count(*) as cnt, avg(UNIX_TIMESTAMP(NOW()) - (nextRun/1000)) as lag from SyncSchedule where state = 0 and nextRun < UNIX_TIMESTAMP(NOW())*1000", [], function(err, ret){
    cb(err, ret && ret[0]);
  })
}

function slack(cb)
{
  dal.query("select count(*) as cnt, avg(UNIX_TIMESTAMP(NOW()) - (nextRun/1000)) as lag from SyncSchedule where state > 0 and nextRun < UNIX_TIMESTAMP(NOW())*1000", [], function(err, ret){
    cb(err, ret && ret[0]);
  })
}

// simple util for consistent but flexible binary options
function isTrue(field)
{
  if(!field) return false;
  if(field === true) return true;
  if(field == "true") return true;
  if(field == "1") return true;
  if(field == "yes") return true;
  return false;
}
