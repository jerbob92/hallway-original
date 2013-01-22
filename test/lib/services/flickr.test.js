var fakeweb = require('node-fakeweb');
var path = require('path');
var helper = require(path.join(__dirname, '..', '..', 'support',
  'locker-helper.js'));

describe("Flickr connector", function () {
  var pinfo;

  beforeEach(function () {
    fakeweb.allowNetConnect = false;

    pinfo = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures',
      'synclets', 'flickr', 'flickr.json'));
  });

  afterEach(function () {
    fakeweb.tearDown();
  });
});
