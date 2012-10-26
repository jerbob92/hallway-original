var lconfig = require("lconfig");
if (!lconfig.taskman) lconfig.taskman = {};
//var fakeredis = require("fakeredis");
var taskman = require('taskman');

var auth = { "consumerKey":"abc","consumerSecret":"def","token":"ghi","tokenSecret":"jkl","profile":{"firstName":"Simon","baseIcon":"user/a/3/5/000000000009553a/square-100.jpg","gender":"m","url":"/people/smurthas/","key":"s611642","lastName":"Murtha-Smith","libraryVersion":310,"isProtected":null,"type":"s","icon":"http://cdn3.rd.io/user/a/3/5/000000000009553a/square-100.jpg"},"pid":"s611642@rdio","accounts":{"c9727a5707c2b2ca8d39bbc85276107a":1351238648275},"apps":{"1":{"consumerKey":"abc","consumerSecret":"def","token":"ghi","tokenSecret":"jkl","accounts":{"c9727a5707c2b2ca8d39bbc85276107a":1351238648275},"at":1351238648277}}};

describe("taskman", function() {
  xdescribe("init()", function() {
    it("should not crash", function(done){
      taskman.init(false, false, done);
    });
  });
  describe("loadSynclets()", function() {
    it("should not crash", function(done){
      taskman.loadSynclets(done);
    });
  });

  describe("getTasks()", function() {
    it("should not crash", function(done){
      taskman.getTasks('s611642@rdio', function(tasks) {
        done()
      });
    });
  });

  xdescribe("taskUpdate", function() {
    it("should not crash", function(done){
      taskman.taskUpdate(auth, done);
    });
  });
});
