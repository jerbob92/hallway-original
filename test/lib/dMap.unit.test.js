require('chai').should();

var lconfig = require("lconfig");
if (!lconfig.database) lconfig.database = {};
lconfig.database.maxConnections = 1;

var dMap = require("dMap");

dMap.load();

describe("dMap", function () {
  it("should load a services dMap");
  it("should be able to retrieve an entry field");

  describe("returns types", function () {
    it("have photos", function () {
      var bases = dMap.types('photos', ['42@facebook', '42@instagram']);
      bases.length.should.equal(2);
      bases[0].should.equal('photo:42@facebook/photos');
    });
  });

  describe("returns bases", function () {
    it("has contact", function () {
      var bases = dMap.bases(['42@facebook', '42@instagram']);
      bases.indexOf('contact:42@facebook/self').should.be.above(-1);
      bases.indexOf('contact:42@instagram/self').should.be.above(-1);
    });
  });
});
