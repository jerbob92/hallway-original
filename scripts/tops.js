var request = require('request');
var async = require('async');

var host;
var auth;

exports.init = function(_host, _auth) {
  host = _host;
  auth = {Authorization:"Basic " + new Buffer(_auth).toString("base64")};
};

function getHits(appID, hours, callback) {
  getHitsPage(appID, hours, {}, {
      url: host + '/apps/logs',
      qs: {
        key: appID,
        limit:100,
        offset:0,
        since: (Date.now() - (hours * 3600 * 1000))
      },
      headers: auth,
      json: true
    }, callback);
}

function getHitsPage(appID, hours, accounts, req, cb) {
  var until = Date.now() - (3600*hours*1000);

  request.get(req, function(err, res, logs) {
    if(err || !Array.isArray(logs)) return cb(err, logs);
    logs.forEach(function(log) {
      if(!Array.isArray(log.data)) return;
      log.data.forEach(function(hit) {
        if(!hit.act || hit.act === 'auth') return;
        if(!accounts[hit.act]) accounts[hit.act] = 0;
        accounts[hit.act]++;
      });
    });
    if (logs.length === 0 ) return cb(null, accounts);
    req.qs.offset += req.qs.limit;
    getHitsPage(appID, hours, accounts, req, cb);
  });
}

function getCustomApps(account, callback) {
  request.get({
    url: host + '/apps/account',
    headers: auth,
    json: true,
    qs: { id: account }
  }, function(err, resp, accountInfo) {
    if (err) return callback(err, accountInfo);
    if (!accountInfo || !accountInfo.apps) return callback('no apps');
    var nonDef = [];
    var apps = accountInfo.apps;
    for (var id in apps) {
      var app = apps[id];
      if (app.appName !== 'Default Singly App') {
        if (!app.clientId) app.clientId = id;
        nonDef.push(app);
      }
    }
    return callback(null, nonDef);
  });
}

function getProfile(act, callback) {
  request.get({
    url: host + '/proxy/'+act+'/profile',
    headers: auth,
    json:true},
    function(err, resp, profile) {
    return callback(err, profile);
  });
}

exports.tops = function(appID, hours, callback) {
  var actprofile = {};

  getHits(appID, hours, function(err, accounts) {
    if (err) return callback('getHits err' + JSON.stringify(err));
    if (!accounts) return callback('account is not an Object' + accounts);
    async.forEachLimit(Object.keys(accounts), 10, function(act, cbAct) {
      getProfile(act, function(err, profile) {
        if (err) callback('failed to proxy for profile' + JSON.stringify(err));
        if (!profile) profile = {};
        getCustomApps(act, function(err, customApps) {
          if (err) return cbAct(err);
          if (customApps && customApps.length > 0) profile.apps = customApps;
          actprofile[act] = profile;
          cbAct();
        });
      });
    }, function() {
      var acts = Object.keys(accounts);
      acts.sort(function(a,b){ return accounts[b] - accounts[a]; });
      var rows = [];
      acts.forEach(function(id) {
        rows.push({
          id: id,
          hits: accounts[id],
          profile: actprofile[id]
        });
      });
      return callback(null, rows);
    });
  });
};

exports.print = function(rows, log) {
  function logRow(id, count, profile) {
    var line = '<tr>';
    line += '<td><a href="https://dawg.singly.com/apps/account?id='+id+'">' +
      id.substring(0, 6) + '</a></td>';
    line += '<td>'+count+'</td>';
    line += '<td><a href="'+profile.url+'">' +
      (profile.name||profile.handle||'--') + '</a></td>';
    line += '<td>'+(profile.location||'&nbsp;')+'</td>';
    line += '<td>'+(profile.email||'&nbsp;')+'</td>';
    var appsText = '';
    var apps = profile && profile.apps && profile.apps.slice(0, 3);
    for (var i in apps) {
      var app = apps[i];
      appsText += '<a alt="' + app.appDescription + '" href="' + host + '/app/info/' + app.clientId + '">' +
        app.appName + '</a> ';
    }
    line += '<td>' + appsText + '</td>';
    line += '</tr>';
    log(line);
  }

  log('<table><tr>');
  log('<td>Account</td><td>Hits</td><td>Name</td><td>Loc</td><td>Email</td><td>Apps</td>');
  log('</tr>');
  rows.forEach(function(row) {
    logRow(row.id, row.hits, row.profile);
  });
  log('</table>');
};

function main() {
  var argv = require('optimist')
      ['default']('hours', 24)
      ['default']('host', 'https://dawg.singly.com')
      .demand(['auth', 'app-id'])
      .usage('node scripts/tops.js --auth dawguser:dawgpass --app-id appid')
      .argv;

  exports.init(argv.host, argv.auth);

  exports.tops(argv['app-id'], argv.hours, function(err, rows) {
    if (err) return console.error(err);
    exports.print(rows, console.log, console.error);
  });
}

if (process.argv[1] === __filename) {
  main();
}
