var mysql = require("mysql");
var logger = require("logger").logger("dal-mysql");
var lconfig = require("lconfig"); // TODO: I don't like this here, I want this more generic, fix later
var async = require("async");

exports.debug = lconfig.debug;
console.log("DEBUG: ",exports.debug);
logger.debug("TEST");

var active = 0;
exports.create = function(config, callback) {

  var options = { };
  if (!config) config = { };
  if (config.hostname) options.host = config.hostname;
  if (config.port) options.port = config.port;
  if (config.username) options.user = config.username;
  if (config.password) options.password = config.password;
  if (config.database) options.database = config.database;
  logger.debug("connecting",++active);
  var client = mysql.createConnection(options);
  client.connect(function(err) {
    if (err) {
      logger.error("Error connecting to mysql");
      logger.error(err);
      return callback(err);
    }
    var instance = new Db(client, options);
    callback(err, instance);
  });
};

exports.destroy = function(instance)
{
  logger.debug("disconnecting",--active);
  if(instance && instance.client) instance.client.destroy();
};

function Db(client, config) {
  this.client = client;
  this.config = config;
  var self = this;
  // Disconnect handler
  function disconnectHandler(client) {
    client.on("error", function(err) {
      if (!err.fatal) return;

      if (err.code !== "PROTOCOL_CONNECTION_LOST") throw err;

      logger.info("Connection to mysql lost, attempting reconnection...");

      client = mysql.createConnection(self.config);
      disconnectHandler(client);
      client.connect(function(err) {
        if (err) throw err;
        logger.info("Reconnected.");
        self.client = client;
      });
    });
  }
  disconnectHandler(this.client);
}

// do the common '?' pattern replacement to bindings for convenience
Db.prototype.sqlize = function(sql, binds)
{
  var client = this.client;
  return sql.replace(/\?/g, function() {
    var arg = binds.shift();
    if(arg === undefined) {
      logger.error("invalid number of binds",sql,binds);
      return "''";
    }
    if(arg === null) return 'NULL';
    if(typeof arg === 'number') return arg.toString();
    return "'" + client.escape(arg.toString()) + "'";
  });
};

Db.prototype.query = function(sql, binds, cbDone) {
  if (!cbDone) {
    cbDone = function() {};
  }

  var self = this;
  //if (binds && binds.length > 0) sql = self.sqlize(sql, binds);
  console.log(binds);
  if (exports.debug) logger.debug(">> mysql: %s", sql);
  //var client = (sql.toLowerCase().indexOf("select") === 0 && sql.toLowerCase().indexOf("from entries") > 0 && this.slave.connectedSync()) ? this.slave : this.client;
  var query = self.client.query(sql, binds, function(error, rows) {
    if (exports.debug) logger.debug("<< mysql: %s", sql);
    if (error) return cbDone(new Error(error));
    console.log(rows);
    cbDone(error, rows);
  });
  return {sql:query.sql};
};

// run all the statements at once!
Db.prototype.multiquery = function(statements, cbDone) {
  if(exports.debug) logger.debug(">> multiqueries",statements.length);
  // THIS IS ACTUALLY SYNC!
//  this.client.multiRealQuerySync(statements.join('; '));
//  while (this.client.multiMoreResultsSync()) { this.client.multiNextResultSync(); }
//  cbDone();
  var client = this.client;
  async.forEachSeries(statements, function(sql, cbLoop){
    client.query(sql, cbLoop);
  }, cbDone);
};

