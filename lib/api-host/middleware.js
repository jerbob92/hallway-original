var connect = require('connect');
var instruments = require('instruments');
var lconfig = require('lconfig');
var logger = require('logger').logger('middleware');
var lutil = require('lutil');
var taskmanNG = require('taskman-ng');
var timing = require('timing');

var _ = require('underscore');

_.str = require('underscore.string');
_.mixin(_.str.exports());

exports.addErrorFns = function (req, res, next) {
  // Returns an error to the user as JSON. Accepts a string or an instance
  // of Error as the first argument along with an optional status code to
  // use in the response.
  res.jsonErr = function (err, opt_statusCode) {
    if (!opt_statusCode) opt_statusCode = 500;
    if (err instanceof Error) {
      var extras = {};
      if (err.originalError) extras = { originalError: err.originalError };
      res.json(lutil.jsonErr(err.message, extras), opt_statusCode);
    } else {
      res.json(lutil.jsonErr(err), opt_statusCode);
    }
  };

  next();
};

// Add functions for updating graphite metrics
exports.addGraphiteFns = function (req, res, next) {
  res.increment = function (metrics) {
    if (!Array.isArray(metrics)) {
      metrics = [metrics];
    }

    //var appId = 'public';

    //if (req._authsome) {
    //  appId = req._authsome.app;
    //} else if (req.param('client_id')) {
    //  appId = req.param('client_id');
    //}

    //var byApp = [];

    //metrics.forEach(function (metric) {
    //  byApp.push(appId + '.' + metric);
    //});

    metrics = metrics.map(function (metric) {
      return 'all.' + metric;
    });

    // These don't scale, we may want to whitelist apps with an SLA so we can
    // prove that we're abiding by that SLA though.
    //metrics = metrics.concat(byApp);

    metrics = metrics.map(function (metric) {
      return 'app.' + metric;
    });

    instruments.increment(metrics).send();
  };

  res.incrementIf = function (predicate, metrics) {
    if (predicate) {
      res.increment(metrics);
    }
  };

  res.incrementFeatures = function () {
    res.incrementIf(lutil.isTrue(req.query.map), 'features.map');
    res.incrementIf(req.query.fields, 'features.fields');
    res.incrementIf(req.query.near, 'features.geo');
    res.incrementIf(req.query.q, 'features.search');
  };

  next();
};

// Everything is v0 by default for now
exports.defaultVersion = function (req, res, next) {
  if (req.url.indexOf('/v0/') === 0) {
    req.url = req.url.substr(3);
  }

  next();
};

exports.incrementApiHits = function (req, res, next) {
  instruments.increment('api.hits').send();

  next();
};

// Log sdk and version
exports.incrementSdkMetrics = function (req, res, next) {
  // get the sdk and version header, should be case insensitive
  var sdk = req.get('x-singly-sdk');
  var sdkVersion = req.get('x-singly-sdk-version');

  // only log if we have an sdk header
  if (sdk) {
    // append sdk version to sdk to form logging key, change periods to dashes
    // in the version, full key example api.sdk.android.1-0-1.hits
    var loggingKey = "api.sdk." + _.camelize(sdk);

    if (sdkVersion) {
      loggingKey += "." + sdkVersion.replace(/[^a-z0-9]/gi, "-");
    }

    loggingKey += ".hits";

    instruments.increment(loggingKey).send();
  }

  next();
};

// Log the duration of requests
exports.logRequestDurations = function (req, res, next) {
  var start = process.hrtime();

  if (res._responseTime) {
    return next();
  }

  res._responseTime = true;

  var path = timing.cleanPath(req.path);
  var type = 'request.durations.' + (_.isEmpty(path) ? 'unknown' : path);

  // The header event is undocumented; I also tried `end` but it never
  // triggered.
  res.on('header', function () {
    var duration = process.hrtime(start);
    var data = {};

    // Duration is [seconds, nanoseconds]. We want milliseconds.
    data[type] = (duration[0] * 1000) + (duration[1] / 1000000);

    // XXX: More parsable format?
    logger.info(req.method, req.url, res.statusCode, data[type], 'ms');

    instruments.increment('api.statusCodes.' + res.statusCode.toString()[0] +
      'xx').send();

    instruments.timing(data).send();
  });

  next();
};

exports.parseOrPassRawBody = function rawParser(req, res, next) {
  if ('application/xml' === connect.utils.mime(req) ||
    (req.url.indexOf('/proxy/dropbox/') === 0 &&
      'application/json' !== connect.utils.mime(req))) {
    req.rawBody = '';
    req.setEncoding('utf8');

    req.on('data', function (chunk) {
      req.rawBody += chunk;
    });

    req.on('end', next);
  } else if (req.url.indexOf('/proxy/google/') === 0 &&
      'application/json' !== connect.utils.mime(req)) {
    req.rawBody = '';
    req.setEncoding('binary');

    req.on('data', function (chunk) {
      req.rawBody += chunk;
    });

    req.on('end', next);

  } else {
    connect.bodyParser()(req, res, next);
  }
};

// enable CORS
exports.cors = function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');

  res.header('Access-Control-Allow-Headers', 'Accept, Cache-Control, Pragma, ' +
    'User-Agent, Origin, X-Request, Referer, X-Requested-With, Content-Type');

  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");

  next();
};

exports.secureAllExceptPublicEndpoints = function (req, res, next) {
  if (req.url.indexOf('/redir/') === 0 ||
    req.url.indexOf('/auth/') === 0 ||
    req.url.indexOf('/oauth/') === 0 ||
    req.url.indexOf('/resources/') === 0 ||
    req.url.indexOf('/enoch') === 0 ||
    req.url.indexOf('/multi') === 0 ||
    req.url.indexOf('/favicon') === 0 ||
    req.url === '/services' ||
    req.url === '/types' ||
    req.url === '/state' ||
    req.url === '/resources.json' ||
    req._authsome) return next();

  if (req.url === '/') return res.redirect('https://singly.com/');

  res.jsonErr('This request requires a valid access_token.', 401);
};

exports.throttleIfBacklogTooHigh = function (req, res, next) {
  taskmanNG.backlog(function (err, data) {
    // If there's an error getting the backlog information err on the side of
    // functionality
    if (err || !data) return next();

    // We could also look at req._authsome.app if this ever gets used as
    // middleware for routes other than /auth/:id/apply
    var appId = req.param('client_id');

    if (!appId) return next();

    if (lconfig.backlogThresholds[appId] &&
      data.total > lconfig.backlogThresholds[appId]) {
      logger.warn('Throttling call to ' + req.url + ' because backlog was ' +
        'too high (' + data.total + ' > ' + lconfig.backlogThresholds[appId]  +
        ')');

      return res.jsonErr('Throttling in effect, please delay further calls',
        503);
    }

    next();
  });
};

exports.requireJSONBody = function (req, res, next) {
  var parseFailed = false;

  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (E) {
      logger.error("couldn't parse /profiles/* body", req.body);
      parseFailed = true;
    }
  }

  if (parseFailed || typeof req.body !== 'object') {
    return res.jsonErr('POST body must be a JSON object.', 400);
  }

  next();
};

// XXX: 'next' must stay because connect checks for fn.length > 3!
exports.lastResortError = function (err, req, res, next) {
  if (err.stack) logger.error(err.stack);

  // TODO:  Decide if this should go to alerting!
  res.jsonErr('Something went wrong. Please report details here: ' +
    'https://github.com/Singly/API/issues');
};
