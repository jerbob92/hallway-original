var express = require('express');
var connect = require('connect');
var logger = require('logger').logger('dawg');
var async = require('async');
var crypto = require('crypto');
var taskman = require('taskman');
var profileManager = require('profileManager');
var ijod = require('ijod');
var pipeline = require('pipeline');
var acl = require('acl');
var instruments = require("instruments");
var lconfig = require('lconfig');
var dal = require('dal');
var alerting = require('alerting');
var request = require('request');
var serializer = require('serializer').createSecureSerializer(lconfig.authSecrets.crypt, lconfig.authSecrets.sign);
var aws = require('dawg-aws');
var _ = require('underscore');

var airbrake;
var apiHostArray = [];
var workerArray = [];
var globals = { ijodtotal: 0, ijodlast: 0, ijodcache: [] };

var services = ['facebook',
                'fitbit',
                'foursquare',
                'gcontacts',
                'github',
                'gmail',
                'google',
                'instagram',
                'linkedin',
                'meetup',
                'runkeeper',
                'tumblr',
                'twitter',
                'withings',
                'wordpress',
                'yammer',
                'zeo'];

function authorize(user, pass) {
  if (!lconfig.dawg || !lconfig.dawg.password) return false;
  var ret = 'dawg' === user & pass === lconfig.dawg.password;
  return ret;
}

var dawg = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    logger.debug("REQUEST %s", req.url);
    next();
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

dawg.get('/aws/estimatedCharges', function(req, res) {
  aws.estimatedCharges(function(err, charges) {
    if (err || !charges) {
      return res.json(err, 500);
    }

    res.json(charges);
  });
});

dawg.get('/aws/counts', function(req, res) {
  aws.instanceCounts(function(err, counts) {
    if (err || !counts) {
      return res.json(err, 500);
    }

    res.json(counts);
  });
});

var redis;
dawg.get('/stats/redis', function(req, res) {
  if(!redis) redis = require('redis').createClient(lconfig.taskman.redis.port, lconfig.taskman.redis.host);
  var ret = {};
  redis.select(1, function() {
    redis.hlen("active", function(err, active) {
      if(err) return res.json(err,500);
      ret.active = active;
      redis.scard("next", function(err, next) {
        if(err) return res.json(err,500);
        ret.next = next;
        redis.info(function(err, info) {
          ret.info = info;
          res.json(ret);
        });
      });
    });
  });
});

dawg.get('/stats/ijod', function(req, res) {
  // calculated every 10min below
  res.json({count:globals.ijodtotal});
});

dawg.get('/stats/bam', function(req, res) {
  // calculated every 10min below
  res.json({AppsPerProfile:globals.app, ProfilesPerAccount:globals.ppa});
});

dawg.get('/profiles/breakdown', function(req, res) {
  var sql = "select service, count(*) as cnt from Profiles ";
  var binds = [];
  if (req.query.since) {
    sql += " where cat > from_unixtime(?) ";
    binds.push(req.query.since);
  }
  sql += " group by service";
  dal.query(sql, binds, function(err, ret) {
    if (err) return res.json(err, 500);
    if (!ret || !ret[0]) return res.json({});
    var ndx = {};
    ret.forEach(function(row) { if (row.service && row.service.length > 0) ndx[row.service] = row.cnt; });
    res.json(ndx);
  });
});

dawg.get('/profiles/get', function(req, res) {
  if (!req.query.pid) return res.json("missing ?pid=id@service",500);
  profileManager.allGet(req.query.pid, function(err, ret) {
    if (err) return res.json(err, 500);
    dal.query("select app, account from Accounts where profile = ?", [req.query.pid], function(err, apps) {
      if (err) return res.json(err, 500);
      if (apps) apps.forEach(function(app) {
        app.token = serializer.stringify([app.account, app.app, +new Date(), null]);
      });
      ret.apps = apps;
      res.json(ret);
    });
  });
});

dawg.get('/profiles/search', function(req, res) {
  if (!req.query.q) return res.json("missing ?q=foo",500);
  dal.query("select id, cat from Profiles where auth like ? limit 100", ['%'+req.query.q+'%'], function(err, ret) {
    if (err) return res.json(err, 500);
    if (!ret || !ret[0]) return res.json([]);
    res.json(ret);
  });
});

function idhex(id) {
  return crypto.createHash('md5').update(id).digest('hex');
}

dawg.get('/profiles/note', function(req, res) {
  if (!req.query.pid) return res.json("missing ?pid=id@service",500);
  if (!req.query.note) return res.json("missing ?note=this+is+my+note",500);
  logger.anubis(req,{act:idhex(req.query.pid), app:'singly', type:'note', note:req.query.note});
  res.json(true);
});

dawg.get('/profiles/notes', function(req, res) {
  var id = (req.query.pid) ? idhex(req.query.pid)+'@' : '';
  var base = 'logs:'+id+'singly/anubis';
  var ret = [];
  var options = {};
  if (req.query.offset) options.offset = parseInt(req.query.offset, 10) || 0;
  options.limit = parseInt(req.query.limit || 20, 10);
  ijod.getRange(base, options, function(item) { ret.push(item); }, function(err) {
    res.send(ret);
  });
});

// Return information about a specific app given its key
dawg.get('/apps/get', function(req, res) {
  if (!req.query.key) {
    return res.json("missing ?key=foo", 500);
  }

  appDetail(req.query.key, function(err, result) {
    if (err || !result)
      return res.json(err, 500);

    res.json(result);
  });
});

function appDetail(key, callback) {
  dal.query("SELECT * FROM Apps WHERE app = ? LIMIT 1", [key],
    function(err, ret) {
    if (err) {
      return callback(err);
    }

    if (!ret || !ret[0]) {
      return callback(null, {});
    }

    // The query is LIMIT 1 so there's only one row
    ret = ret[0];

    if (ret.apikeys) {
      try {
        ret.apikeys = JSON.parse(ret.apikeys);
      } catch(e) {
      }
    }

    if (ret.notes) {
      try {
        ret.notes = JSON.parse(ret.notes);
      } catch(e) {
        return callback(null, ret);
      }

      var idr = 'profile:' + ret.notes.account + '@singly-dev-registration/self#' + ret.notes.account;

      ijod.getOne(idr, function(err, profile) {
        if (!err && profile) {
          ret.profile = profile;
        }

        callback(null, ret);
      });
    } else {
      callback(null, ret);
    }
  });
}

dawg.get('/apps/logs', function(req, res) {
  if (!req.query.key) return res.json("missing ?key=foo",500);
  var base = 'logs:'+req.query.key+'/anubis';
  var ret = [];
  var options = {};
  if (req.query.offset) options.offset = parseInt(req.query.offset, 10) || 0;
  options.limit = parseInt(req.query.limit || 20, 10);
  options.q = req.query.q;
  ijod.getRange(base, options, function(item) { ret.push(item); }, function(err) {
    res.send(ret);
  });
});

dawg.get('/apps/account', function(req, res) {
  if (!req.query.id) return res.json("missing ?id=a23512b4234",500);
  dal.query("select app, account, profile from Accounts where account = ?", [req.query.id], function(err, profiles) {
    if (err) return res.json(err, 500);
    if (!profiles || profiles.length === 0) return res.json({},404);
    var ret = {};
    ret.app = profiles[0].app;
    ret.id = profiles[0].account;
    ret.profiles = [];
    ret.token = serializer.stringify([ret.id, ret.app, +new Date(), null]);
    profiles.forEach(function(row) {
      ret.profiles.push(row.profile);
    });
    res.json(ret);
  });
});

dawg.get('/apps/accounts', function(req, res) {
  appCounts(req, res);
});

function appCounts(req, res, options) {
  var binds = [];

  var appId = '';
  var appSince = '';
  var accountSince = '';

  if (req.query.appSince) {
    appSince = "AND Apps.cat > FROM_UNIXTIME(?) ";

    binds.push(req.query.appSince);
  }

  if (req.query.accountSince) {
    accountSince = "AND Accounts.cat > FROM_UNIXTIME(?) ";

    binds.push(req.query.accountSince);
  }

  if (req.query.id) {
    appId = "AND Apps.app = ? ";

    binds.push(req.query.id);
  }

  var sql = "SELECT " +
      "COUNT(DISTINCT Accounts.account) AS accountCount, " +
      "COUNT(Accounts.account) AS profileCount, " +
      "Apps.app, Apps.notes, Apps.cat " +
      "FROM Accounts, Apps " +
      "WHERE Apps.app = Accounts.app " +
      appSince +
      accountSince +
      appId +
      "GROUP BY Apps.app";

  dal.query(sql, binds, function(err, accounts) {
    if (err) {
      return res.json(err, 500);
    }

    if (!accounts || accounts.length === 0) {
      return res.json([], 404);
    }

    var ret = [];

    async.forEach(accounts, function(account, cbForEach) {
      if (!options || !options.details) {
        try {
          account.notes = JSON.parse(account.notes);
        } catch(e) {
        }

        ret.push({
          id: account.app,
          created: account.cat,
          accounts: parseInt(account.accountCount, 10),
          profiles: parseInt(account.profileCount, 10),
          details: {
            notes: account.notes
          }
        });

        return cbForEach();
      }

      appDetail(account.app, function(err, details) {
        if (err || !details) {
          details = {};
        }

        ret.push({
          id: account.app,
          created: account.cat,
          accounts: parseInt(account.accountCount, 10),
          details: details
        });

        cbForEach();
      });
    }, function() {
      res.json(ret);
    });
  });
}

dawg.get('/devs', function(req, res) {
  var sql = "SELECT COUNT(DISTINCT Accounts.account) AS accountCount, DATE(Accounts.cat) AS day, Apps.app, Apps.notes, Apps.cat " +
    "FROM Accounts, Apps " +
    "WHERE Apps.app = Accounts.app " +
    "AND Apps.app='singly-dev-registration' " +
    "GROUP BY day";

  dal.query(sql, [], function(err, developers) {
    if (err) {
      return res.json(err, 500);
    }
    res.json(developers);
  });
});

dawg.get('/appsbyservice', function(req, res) {
  var sqlBase = "SELECT COUNT(DISTINCT app) FROM Accounts WHERE profile LIKE ";
  var table = {};

  async.forEach(services, function(service, cb) {
    var sql = sqlBase + "'%" + service + "%'";
    dal.query(sql, [], function(err, result) {
      if (err) {
        return res.json(err, 500);
      }
      table[service] = result[0]["COUNT(DISTINCT app)"];
      console.log(table[service]);
      cb(null);
    });
  }, function(err) {
    res.json(table);
  });
});

dawg.get('/appsbyday', function(req, res) {
  var sql = 'SELECT DATE(cat) AS day, COUNT(app) AS appCount ' +
   'FROM Apps ' +
   'GROUP BY day';

  dal.query(sql, [], function(err, apps) {
    if (err) {
      return res.json(err, 500);
    }
    res.json(apps);
  });
});

dawg.get('/productionappsbyday', function(req, res) {
  var sql = "SELECT DATE(cat) AS day, COUNT(app) AS appCount " +
   "FROM Apps " +
   "WHERE apikeys IS NOT NULL " +
   "AND apikeys != '{}' " +
   "GROUP BY day";

  dal.query(sql, [], function(err, apps) {
    if (err) {
      return res.json(err, 500);
    }
    res.json(apps);
  });
});

dawg.get('/invoicestester', function(req, res) {
  res.render('invoicestester');
});

function apiHostState(cb) {
  var apiHosts = [];
  var unresponsive = [];

  async.forEach(apiHostArray, function(apiHost, cbForEach) {
    var ip = apiHost.publicIp;

    if (process.env.NODE_ENV === 'production') {
      ip = apiHost.privateIp;
    }

    request.get({ uri: 'http://' + ip + ':8042/state', json: true, timeout: 5000 }, function(err, res, js) {
      if (err && err.code === 'ETIMEDOUT') {
        unresponsive.push(ip);

        return cbForEach();
      }

      if (typeof js !== 'object') {
        return cbForEach();
      }

      js.publicIp = apiHost.publicIp;
      js.privateIp = apiHost.privateIp;

      apiHosts.push(js);

      cbForEach();
    });
  }, function() {
    cb({
      apiHosts: apiHosts,
      unresponsive: unresponsive
    });
  });
}

var BACKLOG = {};
function workerState(cb) {
  var active = 0;
  var workers = [];
  var unresponsive = [];

  async.forEach(workerArray, function(worker, cbForEach) {
    var ip = worker.publicIp;

    if (process.env.NODE_ENV === 'production') {
      ip = worker.privateIp;
    }

    request.get({ uri: 'http://' + ip + ':8041', json: true, timeout: 5000 }, function(err, res, js) {
      if (err && err.code === 'ETIMEDOUT') {
        unresponsive.push(ip);

        return cbForEach();
      }

      if (typeof js !== 'object') {
        return cbForEach();
      }

      js.publicIp = worker.publicIp;
      js.privateIp = worker.privateIp;

      workers.push(js);

      active += js.active.length;

      cbForEach();
    });
  }, function() {
    cb({
      active: active,
      backlog: BACKLOG.total,
      oldest: BACKLOG.oldest,
      bases: BACKLOG.bases,
      workers: workers,
      unresponsive: unresponsive
    });
  });
}

dawg.get('/workers/state', function(req, res) {
  workerState(function(state) {
    res.json(state);
  });
});

dawg.get('/apiHosts/state', function(req, res) {
  apiHostState(function(state) {
    res.json(state);
  });
});

dawg.get('/onetime/pid2task', function(req, res) {
  logger.info("running onetime pid2task");
  dal.query("select id from Profiles", [], function(err, ret) {
    if(err || !ret) return res.send(err, 500);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("doing "+ret.length+"\n");
    async.forEachLimit(ret, 15, function(row, cbLoop) {
      res.write(row.id+"\n");
      profileManager.authGet(row.id, null, function(err, auth) {
        if(!auth) return cbLoop();
        taskman.taskUpdate(auth, function(err) {
          if(err) res.write([row.id,err,'\n'].join(' '));
          cbLoop();
        }, req.query.force);
      });
    }, function(err) {
      if(err) res.write(err.toString());
      res.end();
    });
  });
});

dawg.get('/onetime/taskscan', function(req, res) {
  logger.info("running onetime taskscan");
  dal.query("select id from Profiles", [], function(err, ret) {
    if(err || !ret) return res.send(err, 500);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("doing "+ret.length+"\n");
    async.forEachSeries(ret, function(row, cbLoop) {
      if(req.query.service && row.id.indexOf(req.query.service) === -1) return cbLoop();
      res.write(row.id+"\n");
      redis.sadd("next", row.id, cbLoop);
    }, function(err) {
      if(err) res.write(err.toString());
      res.end();
    });
  });
});

dawg.get('/links/:type', function(req, res) {
  // Prevent a very expensive query
  if (!req.query.q || req.query.q === '') {
    return res.json([]);
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.write('[');

  var options = {};

  if (req.query.offset) options.offset = parseInt(req.query.offset, 10) || 0;

  options.limit = parseInt(req.query.limit || 20, 10);
  options.q = req.query.q;

  var written = 0;

  ijod.getRange(req.params.type + ':links/oembed', options, function(item) {
    if (written > 0) res.write(',');

    written++;

    // given the map flag, try to map any known fields
    res.write(JSON.stringify(item));
  }, function(err) {
    if (err) logger.error('error sending results for links:',err);

    return res.end(']');
  });
});

function activeApps(opt_since, cb) {
  var options = {
    since: Date.now() - (31556926 * 1000)
  };

  if (parseInt(opt_since, 10)) {
    options.since = parseInt(opt_since, 10);
  }

  acl.getApps(function(err, all) {
    if (err || !all) {
      cb(err);

      return;
    }

    var count = 0;
    var total = 0;

    var hits = {
      apps: []
    };

    async.forEach(all, function(row, cbForEach) {
      ijod.getBounds('logs:' + row.app + '/anubis', options, function(err, bounds) {
        if (!bounds || !bounds.total) {
          return cbForEach();
        }

        // The number of active apps
        count++;

        // The total number of hits among all apps
        total += parseInt(bounds.total, 10);

        appDetail(row.app, function(err, details) {
          // The hits for one app
          hits.apps.push({
            id: row.app,
            hits: parseInt(bounds.total, 10),
            details: details
          });

          cbForEach();
        });
      });
    }, function() {
      hits.total = total;

      cb(null, count, hits);
    });
  });
}

dawg.get('/apps/active', function(req, res) {
  activeApps(req.query.since, function(err, count) {
    if (err) {
      return res.json(err, 500);
    }

    res.json(count);
  });
});


dawg.get('/apps/hits', function(req, res) {
  activeApps(req.query.since, function(err, count, hits) {
    if (err) {
      return res.json(err, 500);
    }

    res.json(hits);
  });
});

// Get a system-wide id uniquely
dawg.get('/id/:id', function(req, res) {
  var id = req.params.id || req.url.substr(1);
  if (id && id.indexOf(':') === -1 && id.indexOf('_') > 0) id = id.substr(0,id.indexOf('_')); // for future use, the second part used for sharding hints, possible validation, etc
  ijod.getOne(id, function(err, entry) {
    if (err) logger.warn(err);
    if (!entry) return res.json("not found",404);
    res.json(entry);
  });
});

// error handling
dawg.error(function(err, req, res, next) {
  if (err.stack) logger.error(err.stack);
  res.json(err, 500);
});

function updateApiHostArray() {
  aws.instanceAddresses('hallway', function(addresses) {
    apiHostArray = addresses;
  });
}

function updateWorkerArray() {
  aws.instanceAddresses('worker', function(addresses) {
    workerArray = addresses;
  });
}

function updateBacklog() {
  logger.debug("updating backlog");
  taskman.backlog(function(data) {
    BACKLOG = data;
    instruments.gauge({
      'workers.backlog': data.total
    }).send();
    setTimeout(updateBacklog, 60000);
  });
}

exports.startService = function(port, ip, cb) {
  dawg.listen(port, ip, function() {
    cb(dawg);
  });

  updateApiHostArray();
  updateWorkerArray();
  updateBacklog();

  // Update the instance arrays from EC2 every 5 minutes
  setInterval(updateApiHostArray, 5 * 60 * 1000);
  setInterval(updateWorkerArray, 5 * 60 * 1000);

  // Minutelies
  setInterval(function() {
    workerState(function(status) {
      if (typeof status !== 'object') {
        return;
      }

      instruments.gauge({
        'workers.active': status.active
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
    appAccountProfiles(function() {});

    // This is expensive on innodb so do less frequently
    activeApps(Date.now() - 86400000, function(err, count) {
      if (err) {
        return;
      }

      instruments.gauge({
        'apps.active.24h': count
      }).send();
    });
  }, 600000);

  appAccountProfiles(function() {});

  // 10-secondlys
  setInterval(function() {
    ijodCounter();
  }, 10000);

  ijodCounter();
};

function ijodCounter() {
  dal.query("SHOW TABLE STATUS LIKE 'Entries'", [], function(err, ret) {
    if (err || !ret || !ret[0]) return;
    globals.ijodlast = globals.ijodtotal;
    globals.ijodcache.unshift(parseInt(ret[0].Rows, 10));
    globals.ijodcache = globals.ijodcache.slice(0,60);
    var cnt = 0;
    var tot = 0;
    globals.ijodcache.forEach(function(rows) {cnt++; tot += rows;});
    globals.ijodtotal = parseInt(tot / cnt, 10);
  });
}

function appAccountProfiles(cb) {
  dal.query("select avg(sq1.cnt) as app, avg(sq2.cnt) as ppa from (select count(*) as cnt from Accounts group by profile) as sq1, (select count(*) as cnt from Accounts group by account) as sq2", [], function(err, ret) {
    if (ret && ret[0]) {
      globals.app = ret[0].app;
      globals.ppa = ret[0].ppa;

      instruments.gauge({
        'bam.appsperprofile': globals.app,
        'bam.profilesperaccount': globals.ppa
      }).send();
    }

    cb(err, ret && ret[0]);
  });
}
