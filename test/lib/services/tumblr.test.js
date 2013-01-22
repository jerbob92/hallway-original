require('chai').should();

var fakeweb = require('node-fakeweb');
var path = require('path');
var helper = require(path.join(__dirname, '..', '..', 'support',
  'locker-helper.js'));

var following = require(path.join('services', 'tumblr', 'following.js'));
var posts = require(path.join('services', 'tumblr', 'posts.js'));

describe("tumblr connector", function () {
  var pinfo;

  beforeEach(function () {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures',
      'connectors', 'tumblr.json'));
  });

  afterEach(function () {
    fakeweb.tearDown();
  });

  describe("following synclet", function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'http://api.tumblr.com:80/v2/blog/www.davidslog.com/info' +
          '?path=%2Fblog%2Fwww.davidslog.com%2Finfo&field=blog&api_key=',
        file: __dirname + '/../../fixtures/synclets/tumblr/blog.json'
      });

      fakeweb.registerUri({
        uri: 'http://api.tumblr.com:80/v2/user/following' +
          '?path=%2Fuser%2Ffollowing&field=blogs&offset=0&limit=50',
        file: __dirname + '/../../fixtures/synclets/tumblr/following.json'
      });
    });

    it('can fetch blog information', function (done) {
      following.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['blog:42@tumblr/following'][0].name.should.equal('david');
        done();
      });
    });
  });

  describe("posts synclet", function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'http://api.tumblr.com:80/v2/blog/foo/posts' +
          '?path=%2Fblog%2Ffoo%2Fposts&field=posts&reblog_info=true' +
          '&notes_info=true&offset=0&limit=50&api_key=',
        file: __dirname + '/../../fixtures/synclets/tumblr/posts.json'
      });
    });

    it('can fetch posts', function (done) {
      pinfo.config = {};
      posts.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['post:42@tumblr/posts'][0].id.should.equal(3507845453);
        done();
      });
    });
  });
});
