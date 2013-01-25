var async = require('async');
var connect = require('connect');
var express = require('express');
var querystring = require('querystring');
var request = require('request');
var sprintf = require('sprintf').sprintf;
var _ = require('underscore');

var lconfig = require('lconfig');
var logger = require('logger').logger('dawg');
var taskStore = require('taskStore');
var taskmanNG = require('taskman-ng');
var profileManager = require('profileManager');
var ijod = require('ijod');
var acl = require('acl');
var instruments = require("instruments");
var dal = require('dal');
var serializer = require('serializer').createSecureSerializer(
  lconfig.authSecrets.crypt, lconfig.authSecrets.sign);
var aws = require('dawg-aws');
var hostStatus = require('host-status').status;
var servezas = require('servezas');
var tokenz = require('tokenz');

var globals = {};

var BACKLOG = {};

var HOUR_IN_MS = 60 * 60 * 1000;

var HOSTS = {
  worker: [],
  taskmaster: [],
  apihost: [],
  stream: [],
  dawg: []
};

var PAPERTRAIL_BASE = 'https://papertrailapp.com/api/v1';
var PAPERTRAIL_SEARCH = PAPERTRAIL_BASE + '/events/search';

// TODO: Replace with Singly authentication
function authorize(user, pass) {
  if (!lconfig.dawg || !lconfig.dawg.password) return false;
  var ret = 'dawg' === user && pass === lconfig.dawg.password;
  return ret;
}

function appDetail(key, callback) {
  if (!key) return callback();

  dal.query("SELECT * FROM Apps WHERE app = ? LIMIT 1", [key],
    function (err, ret) {
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
      } catch (e) {
      }
    }

    if (ret.notes) {
      try {
        ret.notes = JSON.parse(ret.notes);
      } catch (e) {
        return callback(null, ret);
      }

      var idr = 'profile:' + ret.notes.account +
        '@singly-dev-registration/self#' + ret.notes.account;

      ijod.getOne(idr, function (err, profile) {
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

function getCountBefore(since, callback) {
  var binds = [];

  var sql = 'SELECT COUNT(DISTINCT Accounts.account) AS accountCount, ' +
            'Accounts.app FROM Accounts ';
  if (since) {
    sql += ' WHERE Accounts.cat < FROM_UNIXTIME(?) OR Accounts.cat IS  NULL';
    binds.push(since);
  }

  sql += ' GROUP BY Accounts.app';
  dal.query(sql, binds, function (err, rows) {
    var info = {};
    if (err || !rows || !rows.length) return callback(err, rows);
    for (var i in rows) {
      var row = rows[i];
      info[row.app] = parseInt(row.accountCount, 10);
    }
    return callback(null, info);
  });
}

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
      "Apps.app, Apps.notes, Apps.cat, SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT Accounts.account),',',5) as accountList " +
      "FROM Accounts, Apps " +
      "WHERE Apps.app = Accounts.app " +
      appSince +
      accountSince +
      appId +
      "GROUP BY Apps.app";

  dal.query(sql, binds, function (err, accounts) {
    if (err) {
      logger.error('dal.query error', err);
      return res.json(err, 500);
    }

    if (!accounts || accounts.length === 0) {
      return res.json([], 404);
    }

    var ret = [];

    var daysAgo = Math.floor((Date.now() - (7 * 24 * 60 * 60 * 1000)) / 1000);
    //var daysAgo = Math.floor((Date.now() - (30 * 60 * 1000))/1000);

    getCountBefore(daysAgo, function (err, accountsBefore) {
      async.forEach(accounts, function (account, cbForEach) {
        if (!options || !options.details) {
          try {
            account.notes = JSON.parse(account.notes);
          } catch (e) {
          }

          ret.push({
            id: account.app,
            created: account.cat,
            accounts: parseInt(account.accountCount, 10),
            accountsBefore: accountsBefore[account.app],
            profiles: parseInt(account.profileCount, 10),
            accountList: (account.accountList || "").split(','),
            details: {
              notes: account.notes
            }
          });

          return process.nextTick(cbForEach);
        }

        appDetail(account.app, function (err, details) {
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
      }, function () {
        res.json(ret);
      });
    });
  });
}

function getAccountFromClientID(client_id, callback) {
  appDetail(client_id, callback);
}

function getAppInfoFromAccountID(account_id, callback) {
  dal.query("select app, account, profile from Accounts where account = ?",
    [account_id], function (err, profiles) {
    if (err) return callback(err, profiles);
    if (!profiles || profiles.length === 0) return callback(null, {});
    var ret = {};
    ret.app = profiles[0].app;
    ret.id = profiles[0].account;
    ret.profiles = [];
    ret.token = serializer.stringify([ret.id, ret.app, +new Date(), null]);
    profiles.forEach(function (row) {
      ret.profiles.push(row.profile);
    });
    return callback(null, ret);
  });
}

function getAppInfoFromNotes(note, callback) {
  var query = 'SELECT app, notes, cat FROM Apps WHERE notes LIKE ?';
  var values = ['%' + note + '%'];
  dal.query(query, values, function (err, results) {
    if (err) return callback(err);
    callback(null, results);
  });
}

function getAppOwnerAccessTokenFromAccountID(account_id, callback) {
  getAppInfoFromAccountID(account_id, function (err, body) {
    if (err) return callback(err, body);
    return callback(null, body.token);
  });
}

var PROFILES_URL = lconfig.externalBase + '/profile';

function getProfile(access_token, callback) {
  // talk to our API to get the profile
  request.get({
    uri: PROFILES_URL,
    qs: { access_token: access_token },
    json: true
  }, function (err, resp, profile) {
    if (err) return callback(err, profile);
    if (!profile) err = new Error('no profile for access_token');
    return callback(null, profile);
  });
}

function getAppInfoFromClientID(client_id, callback) {
  getAccountFromClientID(client_id, function (err, acct) {
    if (!acct || !acct.notes) {
      return callback('no account returned for client_id', acct);
    }
    var info = {
      name: acct.notes.appName,
      description: acct.notes.appDescription,
      url: acct.notes.appUrl,
      callback: acct.notes.callbackUrl
    };
    function fallback() {
      if (!(acct.profile && acct.profile.data && acct.profile.data.email)) {
        return callback('account doesn\'t have a profile or notes field ' +
          acct.app, info);
      }
      info.email = acct.profile.data.email;
      info.profile = acct.profile.data;
      return callback(null, info);
    }


    if (acct.notes && acct.notes.account) {
      return getAppOwnerAccessTokenFromAccountID(acct.notes.account,
        function (err, ao_access_token) {
        if (err) return callback(err, ao_access_token);
        if (!ao_access_token) return fallback();
        return getProfile(ao_access_token, function (err, profile) {
          if (err) return callback(err, { account: acct, profile: profile});
          if (!profile) fallback();
          info.profile = profile;
          return callback(null, info);
        });
      });
    } else return fallback();
  });
}

function getClientIDFromAccessToken(atok, callback) {
  var clientID;
  try {
    clientID = tokenz.parseAccessToken(atok).app;
  } catch (E) {
    return callback(new Error("Invalid access token", atok));
  }
  return callback(null, clientID);
}

function getAppInfoFromUserAccessToken(access_token, callback) {
  getClientIDFromAccessToken(access_token, function (err, client_id) {
    if (err) return callback(err, client_id);
    getAppInfoFromClientID(client_id, callback);
  });
}

function getAppsSince(since, callback) {
  var query = 'SELECT app, notes, cat FROM Apps WHERE cat > FROM_UNIXTIME(?)';
  var values = [since];
  console.error('values', values);
  dal.query(query, values, function (err, results) {
    if (err) return callback(err);
    for (var i in results) {
      var notes = results[i].notes;
      if (notes) results[i].notes = JSON.parse(notes);
    }
    callback(null, results);
  });
}

var dawg = express();

dawg.use(connect.bodyParser());
dawg.use(connect.cookieParser());

dawg.use(function (req, res, next) {
  logger.debug("REQUEST %s", req.url);
  next();
});

// enable CORS
dawg.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With, " +
    "Authorization");

  // intercept OPTIONS method for CORS
  if (req.method === 'OPTIONS') {
    res.send(200);

    return;
  }

  next();
});

dawg.use(function (req, res, next) {
  if (req.url === '/apple-touch-icon.png' ||
    req.url === '/state') {
    return next();
  }

  express.basicAuth(authorize)(req, res, next);
});

dawg.get('/customers/languages', function (req, res) {
  var sql = 'SELECT Accounts.account, Accounts.profile ' +
    'FROM Accounts ' +
    'INNER JOIN Profiles ' +
      'ON Accounts.profile = Profiles.id ' +
    'WHERE Accounts.app = "singly-dev-registration" ' +
      'AND Profiles.service = "github"';

  var options = {
    limit: 100,
    offset: 0
  };

  var counts = {};

  // XXX: This takes forever
  res.connection.setTimeout(0);

  dal.query(sql, [], function (err, result) {
    async.forEachLimit(result, 10, function (row, forEachCb) {
      var base = 'repo:' + row.profile + '/repos';

      ijod.getRange(base, options, function (item) {
        if (counts[item.data.language] === undefined) {
          counts[item.data.language] = 0;
        }

        counts[item.data.language] += 1;
      }, function (err) {
        logger.info('done', err);

        forEachCb();
      });
    }, function () {
      counts = _.map(counts, function (v, k) {
        return {
          id: k,
          count: v
        };
      });

      counts = _.sortBy(counts, function (language) {
        return -language.count;
      });

      res.json(counts);
    });
  });
});

dawg.get('/customers/likes', function (req, res) {
  var sql = 'SELECT Accounts.account, Accounts.profile ' +
    'FROM Accounts ' +
    'INNER JOIN Profiles ' +
      'ON Accounts.profile = Profiles.id ' +
    'WHERE Accounts.app = "singly-dev-registration" ' +
      'AND Profiles.service = "facebook"';

  var options = {
    limit: 1500,
    offset: 0
  };

  var counts = {};

  // XXX: This takes forever (~10 minutes) and should be moved into a
  // "report" framework
  res.connection.setTimeout(0);

  dal.query(sql, [], function (err, result) {
    async.forEachLimit(result, 10, function (row, forEachCb) {
      async.series([
        function (seriesCb) {
          var urlBase = 'url:' + row.profile + '/url_likes';

          ijod.getRange(urlBase, options, function (item) {
            if (counts[item.data.url] === undefined) {
              counts[item.data.url] = 0;
            }

            counts[item.data.url] += 1;
          }, function (err) {
            logger.info('done', err);

            seriesCb(err);
          });
        },
        function (seriesCb) {
          var pageBase = 'page:' + row.profile + '/page_likes';

          ijod.getRange(pageBase, options, function (item) {
            if (counts[item.data.name] === undefined) {
              counts[item.data.name] = 0;
            }

            counts[item.data.name] += 1;
          }, function (err) {
            logger.info('done', err);

            seriesCb(err);
          });
        }
      ],
      function () {
        forEachCb();
      });
    }, function () {
      counts = _.map(counts, function (v, k) {
        return {
          id: k,
          count: v
        };
      });

      counts = _.sortBy(counts, function (like) {
        return -like.count;
      });

      res.json(counts);
    });
  });
});

dawg.get('/aws/estimatedCharges', function (req, res) {
  aws.estimatedCharges(function (err, charges) {
    if (err || !charges) {
      return res.json(err, 500);
    }

    res.json(charges);
  });
});

dawg.get('/aws/counts', function (req, res) {
  aws.instanceCounts(function (err, counts) {
    if (err || !counts) {
      return res.json(err, 500);
    }

    res.json(counts);
  });
});

var redis;
dawg.get('/stats/redis', function (req, res) {
  if (!redis) redis = require('redis').createClient(lconfig.taskman.redis.port,
    lconfig.taskman.redis.host);
  var ret = {};
  redis.select(1, function () {
    redis.hlen("active", function (err, active) {
      if (err) return res.json(err, 500);
      ret.active = active;
      redis.scard("next", function (err, next) {
        if (err) return res.json(err, 500);
        ret.next = next;
        redis.scard("dirty", function (err, dirty) {
          if (err) return res.json(err, 500);
          ret.dirty = dirty;
          redis.info(function (err, info) {
            ret.info = {};
            info.split(/\s+/).forEach(function (pair) {
              var kv = pair.split(":");
              ret.info[kv[0]] = kv[1];
            });
            res.json(ret);
          });
        });
      });
    });
  });
});

dawg.get('/stats/bam', function (req, res) {
  // calculated every 10min below
  res.json({
    AppsPerProfile: globals.app,
    ProfilesPerAccount: globals.ppa
  });
});

dawg.get('/accounts/total', function (req, res) {
  var sql = "SELECT COUNT(DISTINCT account) AS accountCount FROM Accounts";

  var binds = [];

  if (req.query.until) {
    var until;
    if (!isNaN(req.query.until)) until = parseInt(req.query.until, 10);
    else until = Math.round(new Date(req.query.until).getTime() / 1000);

    if (isNaN(until)) {
      return res.json({
        error: 'bad until param, must be a date or timestamp'
      });
    }

    sql += " WHERE Accounts.cat <= FROM_UNIXTIME(?) OR Accounts.cat IS NULL";

    binds.push(until);
  }

  dal.query(sql, binds, function (err, ret) {
    if (err) {
      return res.json(err, 500);
    }

    if (!ret || !ret[0]) {
      return res.json({});
    }

    res.json({ total: parseInt(ret[0].accountCount, 10) });
  });
});

dawg.get('/profiles/total', function (req, res) {
  var sql = "SELECT COUNT(id) AS profileCount FROM Profiles";

  var binds = [];

  if (req.query.until) {
    var until;
    if (!isNaN(req.query.until)) until = parseInt(req.query.until, 10);
    else until = Math.round(new Date(req.query.until).getTime() / 1000);

    if (isNaN(until)) {
      return res.json({
        error: 'bad until param, must be a date or timestamp'
      });
    }

    sql += " WHERE Profiles.cat <= FROM_UNIXTIME(?) OR Profiles.cat IS NULL";

    binds.push(until);
  }

  dal.query(sql, binds, function (err, ret) {
    if (err) {
      return res.json(err, 500);
    }

    if (!ret || !ret[0]) {
      return res.json({});
    }

    res.json({ total: parseInt(ret[0].profileCount, 10) });
  });
});

dawg.get('/profiles/breakdown', function (req, res) {
  var sql = "select service, count(*) as cnt from Profiles ";
  var binds = [];
  if (req.query.since) {
    sql += " where cat > from_unixtime(?) ";
    binds.push(req.query.since);
  }
  sql += " group by service";
  dal.query(sql, binds, function (err, ret) {
    if (err) return res.json(err, 500);
    if (!ret || !ret[0]) return res.json({});
    var ndx = {};
    ret.forEach(function (row) {
      if (row.service && row.service.length > 0) {
        ndx[row.service] = row.cnt;
      }
    });
    res.json(ndx);
  });
});

dawg.get('/profiles/get', function (req, res) {
  if (!req.query.pid) return res.json("missing ?pid=id@service", 500);
  profileManager.allGet(req.query.pid, function (err, ret) {
    if (err) return res.json(err, 500);
    dal.query("select app, account from Accounts where profile = ?",
      [req.query.pid], function (err, apps) {
      if (err) return res.json(err, 500);
      if (apps) {
        apps.forEach(function (app) {
          app.token = serializer.stringify([app.account, app.app, +new Date(),
            null]);
        });
      }
      ret.apps = apps;
      res.json(ret);
    });
  });
});

dawg.get('/profiles/search', function (req, res) {
  if (!req.query.q) return res.json("missing ?q=foo", 500);
  dal.query("select id, cat from Profiles where auth like ? limit 100",
      ['%' + req.query.q + '%'], function (err, ret) {
    if (err) return res.json(err, 500);
    if (!ret || !ret[0]) return res.json([]);
    res.json(ret);
  });
});

dawg.get('/profiles/tasks', function (req, res) {
  if (!req.query.pid) return res.json("missing ?pid=id@service", 500);
  taskStore.getTasks(req.query.pid, function (err, tasks) {
    if (err) return res.json(err, 500);
    res.json(tasks);
  });
});

dawg.get('/profiles/retask', function (req, res) {
  if (!req.query.pid) return res.json("missing ?pid=id@service", 500);
  profileManager.authGet(req.query.pid, null, function (err, auth) {
    if (!auth) return res.json(err);
    taskmanNG.taskUpdate(auth, function (err) {
      if (err) return res.json(err);
      res.json(true);
    }, req.query.force);
  });
});

dawg.get('/profiles/detask', function (req, res) {
  if (!req.query.pid) return res.json("missing ?pid=id@service", 500);
  taskStore.detask(req.query.pid, function (err) {
    if (err) return res.json(err);
    res.json(true);
  });
});

dawg.get('/run/:pid', function (req, res) {
  var pids = req.params.pid;
  if (!pids) return res.send('need pids!', 400);
  pids = pids.split(',');
  var synclets;
  if (req.query.synclets) synclets = req.query.synclets.split(',');
  if (!Array.isArray(pids)) return res.send('pid split didn\'t work!', 500);

  async.forEachSeries(pids, function (pid, cb) {
    taskmanNG.syncNow(pid, function (err) {
      if (err) return cb(err);
      setTimeout(cb, 1000);
    });
  }, function (err) {
    if (err) return res.json(err, 500);
    res.json({});
  });
});

dawg.post('/syncNow', function (req, res) {
  var pid = req.param('pid');
  taskmanNG.syncNow(pid, function () {
    res.send('ok');
  });
});

dawg.get('/account/apps', function (req, res) {
  if (!req.query.key) {
    return res.json('missiong ?key=foo', 500);
  }
  getAppInfoFromNotes(req.query.key, function (err, results) {
    if (err) return res.send(500);
    else res.json(results);
  });
});

// Return information about a specific app given its key
dawg.get('/apps/get', function (req, res) {
  if (!req.query.key) {
    return res.json("missing ?key=foo", 500);
  }

  // this also resets memcache to current always
  acl.getApp(req.query.key, function () {}, true);

  appDetail(req.query.key, function (err, result) {
    if (err || !result)
      return res.json(err, 500);

    res.json(result);
  });
});

dawg.get('/apps/list', function(req, res) {
  var since = parseInt(req.query.since, 10) ||
            Date.now() - (24 * 3600 * 1000);
  since /= 1000;
  getAppsSince(since, function(err, rows) {
    if (err) return res.json(err, 500);
    res.json(rows);
  });
});

function getLogs(appID, options, callback) {
  var base = 'logs:' + appID + '/anubis';
  var ret = [];
  ijod.getRange(base, options, function (item) { ret.push(item); },
    function (err) {
    return callback(err, ret);
  });
}

dawg.get('/apps/logs', function (req, res) {
  if (!req.query.key) return res.json("missing ?key=foo", 500);
  var options = {};
  if (req.query.offset) options.offset = parseInt(req.query.offset, 10) || 0;
  options.limit = parseInt(req.query.limit || 20, 10);
  if (req.query.since) options.since = parseInt(req.query.since, 10) || 1;
  options.q = req.query.q;
  getLogs(req.query.key, options, function (err, ret) {
    res.send(ret);
  });
});

dawg.get('/apps/logs/stats', function (req, res) {
  if (!req.query.key) return res.json("missing ?key=foo", 500);

  var options = {
    limit: parseInt(req.query.limit || 50, 10)
  };

  getLogs(req.query.key, options, function (err, ret) {
    var services = {};
    var paths = {};
    var errs = {};
    var count = 0;
    var oldest = Date.now();

    for (var i in ret) {
      var l = ret[i];

      if (!l.data) continue;

      for (var j in l.data) {
        count++;

        var call = l.data[j];

        if (call.at < oldest) oldest = call.at;

        if (call.service) {
          if (!services[call.service]) services[call.service] = 1;
          else services[call.service]++;
        }

        if (call.path) {
          if (!paths[call.path]) paths[call.path] = 1;
          else paths[call.path]++;
        }

        if (call.error) {
          call.error = JSON.stringify(call.error);

          if (!errs[call.error]) errs[call.error] = 1;
          else errs[call.error]++;
        }
      }
    }

    res.send({
      services: services,
      paths: paths,
      errors: errs,
      callsPerMin: count / ((Date.now() - oldest) / 1000 / 60)
    });
  });
});

dawg.get('/apps/account', function (req, res) {
  if (!req.query.id) return res.json("missing ?id=a23512b4234", 500);
  dal.query("select app, account, profile from Accounts where account = ?",
    [req.query.id], function (err, profiles) {
    if (err) return res.json(err, 500);
    if (!profiles || profiles.length === 0) return res.json({}, 404);
    var ret = {};
    ret.app = profiles[0].app;
    ret.id = profiles[0].account;
    ret.profiles = [];
    ret.token = serializer.stringify([ret.id, ret.app, +new Date(), null]);
    profiles.forEach(function (row) {
      ret.profiles.push(row.profile);
    });
    if (ret.app !== 'singly-dev-registration') return res.json(ret);

    // singly.com account -- lookup apps
    getAppInfoFromNotes(ret.id, function (err, apps) {
      if (err) {
        logger.warn(err);
        return res.json(err);
      }
      ret.apps = {};
      apps.forEach(function (app) {
        var appNotes;
        try {
          appNotes = JSON.parse(app.notes);
        } catch (e) {
          appNotes = 'cannot parse JSON';
        }
        ret.apps[app.app] = appNotes;
      });
      return res.json(ret);
    });
  });
});

dawg.get('/apps/collab', function (req, res) {
  var appID = req.param('app');
  var account = req.param('account');

  function finishAndRespond(app, res) {
    acl.setAppOwners(appID, app.notes, function (err) {
      if (err) return res.json(500, err);
      return res.json(200, {success: true});
    });
  }

  acl.getApp(appID, function (err, app) {
    if (!app.notes.collab) app.notes.collab = [];
    if (app.notes.collab.indexOf(account) === -1)
      app.notes.collab.push(account);
    dal.query('UPDATE Apps SET notes = ? WHERE app = ?',
      [JSON.stringify(app.notes), appID], function (err) {
      if (err) return res.json(500, err);
      return finishAndRespond(app, res);
    });
  });
});

dawg.get('/proxy/:account/*', function (req, res) {
  var account = req.param('account');
  dal.query("select app, account, profile from Accounts where account = ?",
    [account], function (err, profiles) {
    if (err) return res.json(err, 500);
    if (!profiles || profiles.length === 0) return res.json({}, 404);
    var url = 'https://api.singly.com/' + req.params[0];
    logger.info("proxying", account, url, req.query);
    req.query.access_token = serializer.stringify([account, profiles.app,
      +new Date()]);
    request.get({ url: url, qs: req.query, json: true }).pipe(res);
  });
});

dawg.get('/apps/accounts', appCounts);

dawg.get('/devs', function (req, res) {
  var sql = "SELECT COUNT(DISTINCT Accounts.account) AS accountCount, " +
    "DATE(Accounts.cat) AS day, Apps.app, Apps.notes, Apps.cat " +
    "FROM Accounts, Apps " +
    "WHERE Apps.app = Accounts.app " +
    "AND Apps.app='singly-dev-registration' " +
    "GROUP BY day";

  dal.query(sql, [], function (err, developers) {
    if (err) {
      return res.json(err, 500);
    }
    res.json(developers);
  });
});

function dateAppsOverUserThreshold(users, cbEnd) {
  users = parseInt(users, 10);
  dal.query("SELECT app FROM Accounts GROUP BY app " +
            "HAVING COUNT(DISTINCT account) >= ?", [users],
  function (err, apps) {
    if (err) return cbEnd(err);
    async.mapSeries(_.pluck(apps, 'app'), function (appid, cb) {
      dal.query("SELECT cat from Accounts where app=? GROUP BY account "+
                "ORDER BY cat limit 1 offset ?", [appid, users-1],
      function (err, date) {
        var d = new Date(date[0].cat);
        date = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        cb(err, date);
      });
    }, function (err, dates) {
      if (err) return cbEnd(err);
      dates = _.countBy(dates, function(d) {return d;});
      return cbEnd(null, dates);
    });
  });
}

dawg.get('/date/:num', function (req, res) {
  dateAppsOverUserThreshold(req.params.num, function(err, dates) {
    if (err) return res.end(err);
    res.json(dates);
  });
});

dawg.get('/appsbyservice', function (req, res) {
  var sqlBase = "SELECT COUNT(DISTINCT app) FROM Accounts WHERE profile LIKE ";
  var table = {};

  async.forEach(servezas.serviceList(), function (service, cb) {
    var sql = sqlBase + "'%" + service + "%'";
    dal.query(sql, [], function (err, result) {
      if (err) {
        return res.json(err, 500);
      }
      table[service] = result[0]["COUNT(DISTINCT app)"];
      cb(null);
    });
  }, function () {
    res.json(table);
  });
});

dawg.get('/appsbyday', function (req, res) {
  var sql = 'SELECT DATE(cat) AS day, COUNT(app) AS appCount ' +
   'FROM Apps ' +
   'GROUP BY day';

  dal.query(sql, [], function (err, apps) {
    if (err) {
      return res.json(err, 500);
    }
    res.json(apps);
  });
});

dawg.get('/productionappsbyday', function (req, res) {
  var sql = "SELECT DATE(cat) AS day, COUNT(app) AS appCount, GROUP_CONCAT(app, ',') AS apps " +
   "FROM Apps " +
   "WHERE apikeys IS NOT NULL " +
   "AND apikeys != '{}' " +
   "GROUP BY day";

  dal.query(sql, [], function (err, apps) {
    if (err) {
      return res.json(err, 500);
    }
    res.json(apps);
  });
});

dawg.get('/productionappsactive', function (req, res) {
  var days = req.query.days || 7;
  var under = req.query.under || 50;
  var sql = "select Accounts.app as app, count(*) as cnt from Accounts right join Apps on Apps.app = Accounts.app where Apps.apikeys is not NULL and Accounts.cat > DATE_SUB(NOW(), INTERVAL ? day) GROUP BY Accounts.app HAVING cnt < ?";

  dal.query(sql, [days, under], function (err, apps) {
    if (err) return res.json(err, 500);
    res.json(apps);
  });
});

dawg.get('/invoicestester', function (req, res) {
  res.render('invoicestester');
});

function hostState(hostType, url, cb) {
  var hosts = [];
  var unresponsive = [];

  async.forEach(HOSTS[hostType], function (host, cbForEach) {
    var ip = host.publicIp;

    if (process.env.NODE_ENV === 'production') {
      ip = host.privateIp;
    }

    request.get({
      uri: sprintf(url, ip),
      json: true,
      timeout: 5000
    }, function (err, res, js) {
      if (err &&
        (err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED')) {
        unresponsive.push(host);

        return cbForEach();
      }

      if (!js) {
        logger.debug('Could not fetch', err, sprintf(url, ip), ip);

        return cbForEach();
      }

      js.publicIp = host.publicIp;
      js.privateIp = host.privateIp;

      hosts.push(js);

      cbForEach();
    });
  }, function () {
    cb({
      hosts: hosts,
      unresponsive: unresponsive
    });
  });
}

dawg.get('/workers/state', function (req, res) {
  hostState('worker', 'http://%s:8041/', function (state) {
    state.backlog = BACKLOG.total;
    state.oldest = BACKLOG.oldest;
    state.bases = BACKLOG.bases;

    state.active = 0;

    state.hosts.forEach(function (host) {
      state.active += host.active;
    });

    res.json(state);
  });
});

dawg.get('/apiHosts/state', function (req, res) {
  hostState('apihost', 'http://%s:8042/state', function (state) {
    res.json(state);
  });
});

dawg.get('/stream/state', function (req, res) {
  hostState('stream', 'http://%s:80/state', function (state) {
    res.json(state);
  });
});

dawg.get('/dawg/state', function (req, res) {
  hostState('dawg', 'http://%s:8050/state', function (state) {
    res.json(state);
  });
});

dawg.get('/taskmaster/state', function (req, res) {
  hostState('taskmaster', 'http://%s:8049/', function (state) {
    res.json(state);
  });
});

dawg.get('/state', function (req, res) {
  var ret = hostStatus();

  res.json(ret);
});

dawg.get('/taskCount', function (req, res) {
  var since = 1, until = Date.now();
  if (req.query.hour !== null && req.query.hour !== undefined) {
    var hour = parseInt(req.query.hour, 10) * 3600 * 1000;
    since = Date.now() + hour;
    until = since + (3600 * 1000);
  } else {
    if (req.query.since) {
      try {
        since = parseInt(req.query.since, 10);
      } catch (err) { }
    }
    if (req.query.until) {
      try {
        until = parseInt(req.query.until, 10);
      } catch (err) { }
    }
  }
  taskStore.taskCount(since, until, function (err, taskCount) {
    if (err) return res.json(err, 500);
    return res.json(taskCount);
  });
});

dawg.get('/tasks', function (req, res) {
  var service = req.query.service;
  var synclet = req.query.synclet;
  var range = {};
  if (req.query.since) range.since = parseInt(req.query.since, 10);
  if (req.query.until) range.until = parseInt(req.query.until, 10);
  if (req.query.limit) range.limit = parseInt(req.query.limit, 10);
  taskStore.taskRange(service, synclet, range, function (err, tasks) {
    if (err) return res.json(err, 500);
    res.json(tasks);
  });
});

dawg.get('/onetime/pid2task', function (req, res) {
  logger.info("running onetime pid2task");
  dal.query("select id from Profiles", [], function (err, ret) {
    if (err || !ret) return res.send(err, 500);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("doing " + ret.length + "\n");
    async.forEachLimit(ret, 15, function (row, cbLoop) {
      res.write(row.id + "\n");
      profileManager.authGet(row.id, null, function (err, auth) {
        if (!auth) return cbLoop();
        taskmanNG.taskUpdate(auth, function (err) {
          if (err) res.write([row.id, err, '\n'].join(' '));
          cbLoop();
        }, req.query.force);
      });
    }, function (err) {
      if (err) res.write(err.toString());
      res.end();
    });
  });
});

dawg.get('/onetime/taskscan', function (req, res) {
  logger.info("running onetime taskscan");
  dal.query("select id from Profiles", [], function (err, ret) {
    if (err || !ret) return res.send(err, 500);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("doing " + ret.length + "\n");
    async.forEachSeries(ret, function (row, cbLoop) {
      if (req.query.service && row.id.indexOf(req.query.service) === -1) {
        return process.nextTick(cbLoop);
      }
      res.write(row.id + "\n");
      redis.sadd("next", row.id, cbLoop);
    }, function (err) {
      if (err) res.write(err.toString());
      res.end();
    });
  });
});

dawg.get('/links/:type', function (req, res) {
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

  ijod.getRange(req.params.type + ':links/oembed', options, function (item) {
    if (written > 0) res.write(',');

    written++;

    // given the map flag, try to map any known fields
    res.write(JSON.stringify(item));
  }, function (err) {
    if (err) logger.error('error sending results for links:', err);

    return res.end(']');
  });
});

function activeApps(opt_since, cb) {
  var start = Date.now();

  var options = {
    since: Date.now() - (31556926 * 1000)
  };

  if (parseInt(opt_since, 10)) {
    options.since = parseInt(opt_since, 10);
  }

  logger.debug('activeApps called with since of ' + options.since);

  acl.getApps(function (err, all) {
    if (err || !all) {
      return cb(err);
    }

    var count = 0;
    var total = 0;

    var hits = {
      apps: []
    };

    async.forEachLimit(all, 10, function (row, cbForEach) {
      ijod.getBounds('logs:' + row.app + '/anubis', options,
        function (err, bounds) {
        if (!bounds || !bounds.total) {
          return cbForEach();
        }

        // The number of active apps
        count++;

        // The total number of hits among all apps
        total += bounds.total;

        appDetail(row.app, function (err, details) {
          // The hits for one app
          hits.apps.push({
            id: row.app,
            hits: bounds.total,
            details: details
          });

          cbForEach();
        });
      });
    }, function () {
      var duration = Date.now() - start;

      logger.debug('activeApps with since of ' + options.since + ' finished in ' + duration / 1000 + 's');

      hits.total = total;

      cb(null, count, hits);
    });
  });
}

dawg.get('/apps/active', function (req, res) {
  activeApps(req.query.since, function (err, count) {
    if (err) {
      return res.json(err, 500);
    }

    res.json(count);
  });
});

dawg.get('/apps/hits', function (req, res) {
  activeApps(req.query.since, function (err, count, hits) {
    if (err) {
      return res.json(err, 500);
    }

    res.json(hits);
  });
});

// Get a system-wide id uniquely
dawg.get('/id/:id', function (req, res) {
  var id = req.params.id || req.url.substr(1);
  ijod.getOne(id, function (err, entry) {
    if (err) logger.warn(err);
    if (!entry) return res.json("not found", 404);
    res.json(entry);
  });
});

// error handling
// XXX: 'next' must stay because connect checks for fn.length > 3!
dawg.use(function (err, req, res, next) {
  if (err.stack) logger.error(err.stack);
  res.json(err, 500);
});

function updateHostArray(hostType) {
  aws.instanceAddresses(hostType, function (err, addresses) {
    HOSTS[hostType] = addresses;
  });
}

function updateBacklog() {
  logger.debug("Updating backlog");

  var start = Date.now();

  taskmanNG.backlog(function (data) {
    BACKLOG = data;

    instruments.gauge({ 'workers.backlog': data.total }).send();

    var duration = Date.now() - start;

    instruments.timing({ 'taskman.backlog': duration }).send();

    logger.debug("Updating backlog took " + (duration / 1000) + "s");

    setTimeout(updateBacklog, 60000);
  });
}

function updateAwsHosts() {
  updateHostArray('apihost');
  updateHostArray('worker');
  updateHostArray('taskmaster');
  updateHostArray('dawg');
  updateHostArray('stream');
}

exports.startService = function (port, ip, cb) {
  servezas.load();

  dawg.listen(port, ip, function () {
    acl.init(function () {
      cb(dawg);
    });
  });

  updateAwsHosts();

  // Update the instance arrays from EC2 every 5 minutes
  setInterval(updateAwsHosts, 5 * 60 * 1000);

  updateBacklog();

};

function getAppInfoFromUserAccessTokens(tokens, callback) {
  var allInfo = {};
  async.forEach(tokens, function (token, cbEach) {
    getAppInfoFromUserAccessToken(token, function (err, info) {
      if (!err) allInfo[token] = info;
      cbEach();
    });
  }, function (err) {
    var result = {};
    _.each(allInfo, function (info, token) {
      var slug = JSON.stringify(info);
      if (!result[slug]) {
        result[slug] = info;
        result[slug].tokens = [];
      }
      result[slug].tokens.push(token);
    });
    callback(err, _.map(result, function (info) {
      info.tokenCount = info.tokens.length;
      return info;
    }));
  });
}

dawg.get('/app/info', function (req, res) {
  var tokens = req.param('access_tokens') || req.param('access_token');
  tokens = tokens.split(',');
  getAppInfoFromUserAccessTokens(tokens, function (err, allInfo) {
    if (err) {
      res.json({err: err.toString()});
    } else {
      res.json(allInfo);
    }
  });
});

dawg.get('/app/info/:client_id', function (req, res) {
  getAppInfoFromClientID(req.params.client_id, function (err, appInfo) {
    if (err) return res.json(err, 500);
    res.json(appInfo);
  });
});

function searchLogs(token, query, params, callback) {
  if (typeof(params) === 'function') {
    callback = params;
    params = {};
  }
  params.q = query;

  request.get(PAPERTRAIL_SEARCH, {
    qs: params,
    headers: {
      'X-Papertrail-Token': token
    },
    json: true
  }, function (err, response, logs) {
    return callback(err, logs);
  });
}

function searchLogsSince(time, token, query, options, callback) {
  var allLogs = [];

  function fillLogs(err, logs) {
    if (err) return callback(err);

    allLogs = allLogs.concat(logs.events);

    var earliest = Date.parse(logs.min_time_at);
    if (earliest > time) {
      process.nextTick(function () {
        var newOptions = _.clone(options);
        newOptions.max_id = logs.min_id;
        searchLogs(token, query, newOptions, fillLogs);
      });
    } else {
      callback(null, allLogs);
    }
  }

  searchLogs(token, query, options, fillLogs);
}

dawg.get('/logs/apps', function (req, res) {
  var since = new Date().getTime() - (req.param('hours') * HOUR_IN_MS);
  searchLogsSince(since, lconfig.papertrailToken, req.param('query'), {
    group: lconfig.papertrailGroup
  }, function (err, logs) {
    var messages = _.pluck(logs, 'message');
    var linesByToken = _.groupBy(messages, function (msg) {
      return querystring.decode(msg).access_token;
    });
    var tokens = _.chain(Object.keys(linesByToken))
      .compact()
      .uniq()
      .value();
    getAppInfoFromUserAccessTokens(tokens, function (err, allInfo) {
      allInfo.forEach(function (info) {
        info.lines = [];
        info.tokens.forEach(function (token) {
          var cleanLines = _.map(linesByToken[token], function (line) {
            return line.replace(/access_token=[^&]+/, 'access_token=###');
          });
          info.lines = info.lines.concat(cleanLines);
        });
        info.lineCount = info.lines.length;
      });
      res.json(allInfo);
    });
  });
});
