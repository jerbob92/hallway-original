require('chai').should();

var fakeweb = require('node-fakeweb');
var path = require('path');
var helper = require(path.join(__dirname, '..', '..', 'support',
  'locker-helper.js'));
var resolve = require(path.join('services', 'links', 'resolve.js'));
var dMap = require('dMap');

var lconfig = require('lconfig');

lconfig.database.maxConnections = 1;

var dal = require('dal');

dal.setBackend('fake');

var oembed = require(path.join('services', 'links', 'oembed.js'));

var ijod = require('ijod');

dMap.load();

before(ijod.initDB);

describe('links services', function () {
  var tweets = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures',
    'synclets', 'twitter', 'home_timeline.js'));

  var entry = {
    data: tweets[0],
    idr: 'tweet:42@twitter/timeline#71348168469643264'
  };

  var entry_yt = {
    idr: 'tweet:42@twitter/timeline#71348168469643264',
    refs: {
      'http://www.youtube.com/watch?v=vy4ZR5nIBFs':
        'http://www.youtube.com/watch?v=vy4ZR5nIBFs'
    }
  };

  var entry_raw = {
    idr: 'tweet:42@twitter/timeline#71348168469643264',
    refs: {
      'http://jeremie.com/i/9ccd26484285318d8fb265b0dfc201ad.png':
        'http://jeremie.com/i/013ec4348b61ef0bfff093819d2b8746.png'
    }
  };

  beforeEach(function () {
    fakeweb.allowNetConnect = false;
  });

  afterEach(function () {
    fakeweb.tearDown();
  });

  describe('resolver pump', function () {
    beforeEach(function () {
      fakeweb.registerUri({ uri: 'http://bit.ly:80/jBrrAe', body: '' });
      fakeweb.registerUri({ uri: 'http://bit.ly:80/jO9Pfy', body: '' });
    });

    it('can resolve stuff', function (done) {
      resolve.pump([entry], function (err, set) {
        if (err) {
          return done(err);
        }

        Object.keys(set[0].refs).length.should.equal(2);

        done();
      });
    });
  });

  describe('oembed pump', function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'http://www.youtube.com:80/oembed?url=http%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dvy4ZR5nIBFs',
        file: __dirname + '/../../fixtures/synclets/links/oembed_yt.json'
      });

      fakeweb.registerUri({
        uri: 'http://api.embed.ly:80/1/oembed?key=4f95c324c9dc11e083104040d3dc5c07&url=http%3A%2F%2Fjeremie.com%2Fi%2F9ccd26484285318d8fb265b0dfc201ad.png',
        file: __dirname + '/../../fixtures/synclets/links/oembed_raw.json'
      });
    });

    it('can process youtube', function (done) {
      oembed.pump([entry_yt], function (err, set) {
        if (err) {
          return done(err);
        }

        Object.keys(set[0].refs).length.should.equal(2);

        set[1].data.type.should.equal('video');

        return done();
      });
    });

    it('can process raw', function (done) {
      oembed.pump([entry_raw], function (err, set) {
        if (err) {
          return done(err);
        }

        Object.keys(set[0].refs).length.should.equal(2);

        set[1].data.type.should.equal('photo');

        return done();
      });
    });
  });
});
