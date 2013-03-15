var async = require('async');
var crypto = require('crypto');
var urllib = require('url');
var request = require('request');
var idr = require('idr');
var logger = require('logger').logger('oembed');
var ijod = require('ijod');
var nexusClient = require('nexusClient');

var TIMEOUT = 10000;

// TODO: Move key to lconfig
var EMBEDLY_URL = 'http://api.embed.ly/1/oembed?key=4f95c324c9dc11e083104040d3dc5c07';

var OEMBED_URLS = {
  youtube:     [/youtube\.com\/watch.+v=[\w\-]+/i, 'http://www.youtube.com/oembed'],
  instagram:   [/instagr\.am\/.+/i,                'http://api.instagram.com/oembed'],
  flickr:      [/flickr\.com\/photos\/.+/i,        'http://flickr.com/services/oembed?format=json'],
  viddler:     [/viddler\.com\/.+/i,               'http://lab.viddler.com/services/oembed/?format=json'],
  blip:        [/blip\.tv\/.+/i,                   'http://blip.tv/oembed/'],
  yfrog:       [/yfrog\.com\/.+/i,                 'http://www.yfrog.com/api/oembed'],
  hulu:        [/hulu\.com\/watch\/.+/i,           'http://www.hulu.com/api/oembed.json'],
  vimeo:       [/vimeo\.com\/.+/i,                 'http://vimeo.com/api/oembed.json'],
  dailymotion: [/dailymotion\.com\/.+/i,           'http://www.dailymotion.com/api/oembed/'],
  scribd:      [/scribd\.com\/.+/i,                'http://www.scribd.com/services/oembed'],
  slideshare:  [/slideshare\.net\/.+/i,            'http://www.slideshare.net/api/oembed/1'],
  // XXX: PhotoBucket's oembed endpoint requires cookies, redirects to infinity
  //photobucket: [/photobucket\.com\/.+/i,           'http://photobucket.com/oembed/'],
  wordpress:   [/wordpress\.com\/.*/i,             'http://public-api.wordpress.com/oembed/1.0/?for=singly.com']
};

// scan refs to see if we did links already, idempotent assuming we're the only
// ones making http's
function linksDone(refs) {
  if (!refs) return false;

  var refKeys = Object.keys(refs);

  for (var i = 0; i < refKeys.length; i++) {
    if (refKeys[i].indexOf('link:') === 0) return true;
  }

  return false;
}

// basic util to fetch oembed results from known providers, falling back on
// embedly
function oembed(url, callback) {
  if (typeof(url) !== 'string') return callback();

  var stack = [];

  // try any in our regex url map
  for (var service in OEMBED_URLS) {
    if (OEMBED_URLS[service][0].test(url)) {
      stack.push(OEMBED_URLS[service][1]);
    }
  }

  // hard-wired embedly
  stack.push(EMBEDLY_URL);

  // now try any of the options until one succeeds
  async.forEachSeries(stack, function (u, cb) {
    var up = urllib.parse(u, true);

    up.query.url = url;

    delete up.search;

    request.get({
      uri            : urllib.format(up),
      json           : true,
      timeout        : TIMEOUT,
      followRedirect : true,
      maxRedirects   : 3
    }, function (err, resp, body) {
      if (err || !body || !body.type) {
        logger.debug('oembed failed', urllib.format(up),
          err || resp.statusCode);
      }

      if (err || !body || !body.type) return cb(); // continue on to next one

      // yfrog does this, image is not in the spec
      if (body.type === 'image') body.type = 'photo';

      cb(body); // aborts and finishes w/ a result
    });
  }, callback);
}

// be as smart as possible to bulk process all urls in a changeset, often they
// have some affinity
exports.pump = function (changeset, callback) {
  var did = {};

  // save out each url as a ref to any entries
  function saver(task, data) {
    // first time this is created, insert it!
    if (data && !did[task.url]) {
      did[task.url] = data;

      var entry = { idr: task.idr, at: Date.now(), data: data, types: {} };

      // need alias saved that is used by original entry
      entry.types[data.type] = true;

      // preserve the first seen
      if (task.entries[0]) entry.from = task.entries[0].idr;

      changeset.push(entry); // should be safe since we skip these
    } else {
      data = did[task.url];
    }

    // tag each entry w/ the type'd reference too
    var r = idr.clone(task.idr);
    r.protocol = data.type;
    var typed = idr.toString(r);
    task.entries.forEach(function (entry) {
      if (!entry.refs) entry.refs = {};
      entry.refs[typed] = task.url;
      entry.q = [entry.q, data.title, (data.type === 'link') ? data.url : '']
        .join(' ');
    });
  }

  var doing = {};

  // worker queue to lookup/save urls
  var q = async.queue(function (task, cb) {
    // normalized idr for any link
    nexusClient.getOne(task.idr.href, function (err, entry) {
      // existing, niiice
      if (entry) {
        did[task.url] = entry.data;
        saver(task);
        return cb();
      }

      // now do oembed, have max fail-safe timer since the oembeds don't always
      // internally timeout sanely
      task.timer = setTimeout(function () {
        logger.debug('timing out', task.url);
        task.timer = false;
        // TODO: we used to cache errors, and now we always retry, there might
        // be a happier medium
        // // save a blank one since it broke
        // saver(task, {type:'link', url:task.url, err:'oEmbed timed out.'});
        cb();
      }, TIMEOUT * 2); // max failsafe is double the desired/normal timeout

      oembed(task.url, function (data) {
        if (task.timer === false) return; // timed out already!
        clearTimeout(task.timer);
        if (!data) return cb(); // bail if no oembed
        //if (!data) data = {err:'Could not fetch oEmbed data.'};
        if (typeof data.type !== 'string') data.type = 'link';
        if (typeof data.url !== 'string') data.url = task.url;

        saver(task, data);

        cb();
      });
    });
  }, 10);

  q.drain = function () {
    callback(null, changeset);
  };

  // only queue up each url if any
  var pushed = false;

  changeset.forEach(function (entry) {
    if (!entry.refs) return;
    if (linksDone(entry.refs)) return; // idempotent

    Object.keys(entry.refs).forEach(function (url) {
      if (url.indexOf('http') !== 0) return; // only process http* refs
      var digest = crypto.createHash('md5').update(url).digest('hex');
      var task = {
        entries: [entry],
        url: url,
        idr: idr.parse('oembed:links/oembed#' + digest)
      };
      // skip ones already done
      if (did[url]) return saver(task);
      // already in the queue, append
      if (doing[url]) return doing[url].entries.push(entry);
      // push a new task on the queue
      doing[url] = task;
      pushed = true;
      q.push(task);
    });
  });

  // this is a stupid pattern with queues, there should be a better way
  if (!pushed) q.drain();
};
