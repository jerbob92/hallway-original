var genericPool = require("generic-pool");
var lconfig = require("lconfig");
var path = require("path");
var async = require('async');
var logger = require("logger").logger("DAL");
var instruments = require("instruments");

var currentBackend = "mysqlclient";
var module = require(path.join(".", "dal-" + currentBackend + ".js"));

var pool = genericPool.Pool({
  name: "db",
  create: function(callback) {
    try {
      module.create(lconfig.database, callback);
    } catch (E) {
      callback(E);
    }
  },
  destroy:function(client) {
    logger.debug("Cleaning up a DB connection");
    try {
      if (module.destroy) module.destroy(client);
    } catch (E) {
      logger.error(E);
    }
  },
  max: (lconfig.database && lconfig.database.maxConnections) || 20,
  idleTimeoutMillis: (lconfig.database && lconfig.database.maxTimeout) || 10000
});

exports.setBackend = function(backend) {
  currentBackend = backend;
  module = require(path.join(".", "dal-" + currentBackend + ".js"));
}
exports.getBackendModule = function() {
  return module;
}

// Helper for a future query debug logger
// E.stack.split("\n")[3].match(/at\s(.*)$/)[1]

// // simple utility to run batch at once
exports.bQuery = function(queries, callback) {
  if(!queries || !Array.isArray(queries)) return callback(new Error("passed in queries is not an array"));
  async.forEachSeries(queries, function(scriptSql, cb) {
    exports.query(scriptSql, [], cb);
  }, function(err) {
    if(err) console.error("dal query failed: ",err);
    callback(err);
  });
}

exports.query = function(sql, binds, cbDone) {
  var self = this;

  var startTime = Date.now();
  pool.acquire(function(error, db) {
    if (error) return cbDone(new Error(error));

    return db.query(sql, binds, function(error, rows, res) {
      pool.release(db);
      instruments.timing({"dal.query_length": (Date.now() - startTime)}).send();
      instruments.increment("dal.query_count").send();
      if (cbDone) cbDone(error, rows, res);
    });
  });
}

// run bunch of sql commands at once
exports.multiquery = function(sqls, cbDone) {
  var self = this;

  var startTime = Date.now();
  pool.acquire(function(error, db) {
    if (error) return cbDone(new Error(error));

    return db.multiquery(sqls, function(ret) {
      pool.release(db);
      instruments.timing({"dal.multiquery_length": (Date.now() - startTime)}).send();
      if (cbDone) cbDone(ret);
    });
  });
}

// simple pass-through util to escape strings, dumb it has to be pool'd
exports.sqlize = function(sql, binds) {
  pool.acquire(function(error, db) {
    if (error) return "";
    var ret = db.sqlize(sql, binds);
    pool.release(db);
    return ret;
  });
}