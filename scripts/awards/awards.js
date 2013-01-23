var fs = require('fs');
var nodemailer = require('nodemailer');
var async = require('async');

var auth, host;
var error, log, attach;
var output = '';

exports.init = function(modules, options) {
  for (var i in modules) {
    modules[i].init(options.host, options.auth, options.ignore);
  }

  if (options.error) error = getFileLogger(options.error);
  else error = console.error;

  if (options.to && options.user && options.pass) {
    log = function(str) {
      output += str;
    };
    if (options.attachCSV) {
      attach = getBufferLogger();
    }
  } else if (options.log) {
    log = getFileLogger(options.log);
  } else {
    log = console.log;
  }
};

function getFileLogger(filename) {
  return fs.appendFileSync.bind(fs, filename);
}

function getBufferLogger() {
  var str = '';
  var a = function(_str) {
    str += _str + '\n';
  }
  a.get = function() { return str; }
  return a;
}


exports.awards = function(appID, hours, format, modules, callback) {
  var options = {
    appID: appID,
    hours: hours
  };

  async.forEachSeries(modules, function(script, cbScript) {
    if (format === 'email') log('<h3> ' + script.title + ' </h3>');
    script.run(options, function(err, rows) {
      if (err) return error(script + ' error', err);
      if (format === 'email') {
        printTable(script, rows, log);
        if (attach) printCSV(script, rows, attach);
      } else printCSV(script, rows, log);
      return cbScript();
    });
  }, function(err) {
    callback();
  });
};


function printTable(script, rows, log) {
  log('<table><tr>');
  for (var i in script.columnNames) {
    log('<td>' + script.columnNames[i] + '</td>');
  }
  log('</tr>');
  rows.forEach(function(row) {
    log('<tr>');
    var rowVals = script.mapRow(row);
    for(var i in rowVals) {
      var text = '';
      var type = typeof rowVals[i];
      if (type === 'string' || type === 'number') text = rowVals[i]||'&nbsp;';
      else if (type === 'object') {
        var href = rowVals[i].href;
        var str = rowVals[i].text || '--';
        if (rowVals[i].truncate) str = str.substring(0, rowVals[i].truncate);
        text = '<a href="' + href + '">' + str + '</a>';
      }
      log('<td>' + text + '</td>');
    }
  });
  log('</table>');
}

function printCSV(script, rows, log) {
  log(script.columnNames.join(','));
  for(var i in rows) {
    var rowVals = script.mapRow(rows[i]);
    rowText = '';
    for (var k in rowVals) {
      var text = '';
      var type = typeof rowVals[k];
      if (type === 'string' || type === 'number') text = rowVals[k];
      else if (type === 'object') {
        var str = rowVals[k].text || '--';
        if (rowVals[k].truncate) str = str.substring(0, rowVals[k].truncate);
        text = str;
      }
      rowText += JSON.stringify(text) + ',';
    }
    log(rowText);
  }
}

function sendMail(options) {
  var smtpTransport = nodemailer.createTransport("SMTP", {
    service: options.service || "SendGrid",
    auth: {
      user: options.user,
      pass: options.pass
    }
  });

  var mailOptions = {
    from: options.from,
    to: options.to,
    subject: options.subject || "Daily Dev Awards",
    html: output,
    headers: {
      "X-SMTPAPI": {
        filters: {
          clicktrack: { settings: { enable:0 } },
          opentrack: { settings: { enable:0 } }
        }
      }
    }
  };

  if (attach) {
    mailOptions.attachments = [{
      fileName: new Date() + '.csv',
      contents: attach.get()
    }];
  }

  smtpTransport.sendMail(mailOptions, function(err, response){
    if(err) error(err);
    smtpTransport.close();
  });
}


function main() {
  var argv = require('optimist')
      ['default']('hours', 24)
      ['default']('host', 'https://dawg.singly.com')
      ['default']('format', 'email')
      ['default']('reports', 'tops,newApps')
      .boolean('attach-csv')
      .alias('attach-csv', 'attachCSV')
      .demand(['auth', 'app-id'])
      .usage('node awards.js --auth dawguser:dawgpass --app-id appid')
      .argv;

  argv.reports = argv.reports.split(',');
  var modules = [];
  for (var i in argv.reports) {
    modules.push(require(__dirname + '/' + argv.reports[i]));
  }

  exports.init(modules, argv);

  if (argv.format === 'email') {
    log('<html><body>');
    log('<h2>Dev Awards produced at ' + new Date() + '</h2><br>');
  }
  exports.awards(argv['app-id'], argv.hours, argv.format, modules, function(err) {
    if (argv.format === 'email') log('</body></html>');
    if (argv.to && argv.user && argv.pass) {
      sendMail(argv);
    }
  });
}

if (process.argv[1] === __filename) {
  main();
}

