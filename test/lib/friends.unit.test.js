var should = require('should');
var path = require('path');
var fs = require('fs');
var lconfig = require("lconfig");
if (!lconfig.database) lconfig.database = {};
if (!lconfig.taskman) lconfig.taskman = {};
lconfig.database.maxConnections = 1;
var dMap = require('dMap');
var friends = require("friends");

describe("friends", function() {
  before(dMap.startup);
  describe("returns parallels", function() {
    it("for facebook", function(done){
      var self = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'common', 'fbself.json')));
      var pars = friends.parallels(self[0]);
      pars.length.should.equal(4);
      pars[0].should.equal('0156df09');
      done();
    });
  });
});

