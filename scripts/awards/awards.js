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
  };
  a.get = function() { return str; };
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
      log('<td>' + convertValToTableRow(rowVals[i]) + '</td>');
    }
  });
  log('</table>');
}

function convertValToTableRow(val) {
  var text = '';
  var type = typeof val;
  if (type === 'string') text = val||'&nbsp;';
  else if(type === 'number') text = val;
  else if (Array.isArray(val)) {
    for(var i in val) text += convertValToTableRow(val[i]) + ' ';
  } else if (type === 'object') {
    var href = val.href;
    var str = val.text || '--';
    if (val.truncate) str = str.substring(0, val.truncate);
    text = '<a href="' + href + '">' + str + '</a>';
  }
  return text;
}

function printCSV(script, rows, log) {
  log(script.columnNames.join(','));
  for(var i in rows) {
    var rowVals = script.mapRow(rows[i]);
    var rowText = '';
    for (var k in rowVals) {
      rowText += JSON.stringify(convertValToCSVRow(rowVals[k])) + ',';
    }
    log(rowText);
  }
}

function convertValToCSVRow(val) {
  var text = '';
  var type = typeof val;
  if (type === 'string' || type === 'number') text = val;
  else if (Array.isArray(val)) {
    for(var i in val) {
      text += convertValToCSVRow(val[i]);
    }
  } else if (type === 'object') {
    var str = val.text || '--';
    if (val.truncate) str = str.substring(0, val.truncate);
    text = str;
  }
  return text;
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
      ['default']('reports', 'newApps,newAccounts,tops')
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

