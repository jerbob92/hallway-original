var genericPool = require('generic-pool');
var lconfig = require('lconfig');
var path = require('path');
var logger = require('logger').logger('DAL');
var instruments = require('instruments');

var currentBackend = 'mysql';
var backendModule = require(path.join('.', 'dal-' + currentBackend + '.js'));

var WORKER_NAME = process.env.WORKER || require('os').hostname();
var WORKER_KEY = WORKER_NAME.replace(/\..*$/, '');

exports.create = function (database) {
  var ret = { database: database };

  ret.pool = genericPool.Pool({
    name: "db",
    create: function (callback) {
      try {
        backendModule.create(database, callback);
      } catch (E) {
        callback(E);
      }
    },
    destroy: function (client) {
      logger.debug("Cleaning up a DB connection");
      try {
        if (backendModule.destroy) backendModule.destroy(client);
      } catch (E) {
        logger.error(E);
      }
    },
    max: (database.maxConnections) || 20,
    idleTimeoutMillis: (database.maxTimeout) || 10000
  });

  // use our pool
  ret.query = function (sql, binds, cbDone) {
    exports.query(sql, binds, cbDone, ret.pool);
  };

  return ret;
};

var dal = exports.create(lconfig.database);

// Wrap pool.acquire to provide timing information
function timedAcquire(pool, cb) {
  var startTime = Date.now();

  pool.acquire(function (error, db) {
    var stats = {};

    stats['dal.' + WORKER_KEY + '.pool.acquire'] = Date.now() - startTime;

    instruments.timing(stats).send();

    stats = {};

    stats['dal.' + WORKER_KEY + '.pool.size'] = pool.getPoolSize();
    stats['dal.' + WORKER_KEY + '.pool.waiting'] = pool.waitingClientsCount();
    stats['dal.' + WORKER_KEY + '.pool.available'] = pool.availableObjectsCount();

    instruments.gauge(stats).send();

    cb(error, db);
  });
}

exports.setBackend = function (backend) {
  currentBackend = backend;
  backendModule = require(path.join('.', 'dal-' + currentBackend + '.js'));

  dal = exports.create(lconfig.database);
};

exports.getBackend = function () {
  return currentBackend;
};

exports.getBackendModule = function () {
  return backendModule;
};

exports.query = function (sql, binds, cbDone, pool) {
  if (!pool) pool = dal.pool;

  timedAcquire(pool, function (error, db) {
    if (error) return cbDone(new Error(error));

    var startTime = Date.now();

    return db.query(sql, binds, function (error, rows, res) {
      pool.release(db);

      instruments.timing({ 'dal.query_length': (Date.now() - startTime) }).send();
      instruments.increment('dal.query_count').send();

      if (cbDone) cbDone(error, rows, res);
    });
  });
};
