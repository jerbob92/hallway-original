var lconfig = require("lconfig");
if (!lconfig.taskman) lconfig.taskman = {};
var taskman = require('taskman');

describe("taskman", function() {
  describe("loadSynclets()", function() {
    it("should not crash", function(done){
      taskman.loadSynclets(done);
    });
  });
});
