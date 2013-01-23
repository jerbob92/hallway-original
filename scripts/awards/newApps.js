var request = require('request');
var async = require('async');

var host;
var auth;
var ignoredUsers;

exports.init = function(_host, _auth, _ignoredUsers) {
  host = _host;
  auth = {Authorization:"Basic " + new Buffer(_auth).toString("base64")};
  ignoredUsers = _ignoredUsers;
};

exports.title = 'New apps';

function getProfile(act, callback) {
  request.get({
    url: host + '/proxy/'+act+'/profile',
    headers: auth,
    json:true},
    function(err, resp, profile) {
    return callback(err, profile);
  });
}

exports.run = function(options, callback) {
  var hours = options.hours;
  request.get({
    url: host + '/apps/list',
    qs: { since: Date.now() - (hours * 3600000)},
    headers: auth,
    json:true}, function(err, resp, results) {
    if (err) return callback('getHits err' + JSON.stringify(err));
    var apps = [];
    for(var i in results) {
      var act = results[i].notes && results[i].notes.account;
      if(!ignoredUsers || ignoredUsers.indexOf(act) === -1) apps.push(results[i]);
    }
    var byAccount = {};
    async.forEachLimit(apps, 10, function(app, cbAct) {
      var act = app.notes.account;
      getProfile(act, function(err, profile) {
        if (err) callback('failed to proxy for profile' + JSON.stringify(err));
        if (!profile) profile = {};
        app.notes.profile = profile;
        byAccount[app.notes.account] = byAccount[app.notes.account] || app;
        profile = byAccount[app.notes.account].notes.profile;
        profile.apps = profile.apps || [];
        profile.apps.push(app);
        cbAct();
      });
    }, function() {
      var rows = [];
      Object.keys(byAccount).forEach(function(account) {
        var app = byAccount[account];
        rows.push({
          id: app.notes.account,
          profile: app.notes.profile
        });
      });
      return callback(null, rows);
    });
  });
};

exports.mapRow = function(row) {
  var values = [
    {
      href: 'https://dawg.singly.com/apps/account?id=' + row.id,
      text: row.id,
      truncate: 6
    },
    {
      href: row.profile.url,
      text: row.profile.name || row.profile.handle
    },
    row.profile.location,
    row.profile.email
  ];

  var appsLinks = [];
  var apps = row.profile && row.profile.apps && row.profile.apps.slice(0, 3);
  for (var i in apps) {
    var app = apps[i];
    appsLinks.push({
      href: host + '/app/info/' + app.app,
      text: app.notes.appName
    });
  }
  values.push(appsLinks);
  return values;
}

exports.columnNames = ['Account','Name','Loc','Email','Apps'];

function main() {
  var argv = require('optimist')
      ['default']('hours', 24)
      ['default']('host', 'https://dawg.singly.com')
      .demand(['auth'])
      .usage('node scripts/newApps.js --auth dawguser:dawgpass')
      .argv;

  var ignored = argv.ignore || '';
  ignored = ignored.split(',');
  console.error(ignored);
  exports.init(argv.host, argv.auth, ignored);

  exports.run({hours:argv.hours}, function(err, rows) {
    if (err) return console.error(err);
    exports.print(rows, console.log, console.error);
  });
}

if (process.argv[1] === __filename) {
  main();
}
