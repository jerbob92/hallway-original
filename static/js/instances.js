/*global commas:true*/
function refresh() {
  async.parallel({
    head: function (callback) {
      $.getJSON('https://api.github.com/repos/Singly/hallway/commits',
        function (commits) {
        callback(null, commits[0]);
      });
    },
    workers: function (callback) {
      $.getJSON('/workers/state', function (state) {
        callback(null, state.workers);
      });
    },
    apiHosts: function (callback) {
      $.getJSON('/apiHosts/state', function (state) {
        callback(null, state.apiHosts);
      });
    }
  },
  function (err, results) {
    $('#rows').html('');

    $('#head').html(sprintf('<a href="https://github.com/Singly/hallway/commit/%s">%s</a>',
      results.head.sha,
      results.head.sha.slice(0, 8)));

    var instances = results.workers.concat(results.apiHosts);

    instances = _.sortBy(instances, 'host');

    _.each(instances, function (instance) {
      instance.host = instance.host.replace(/\.singly\.com/, '');

      var url = 'http://' + instance.publicIp + ':8042/state';

      if (/worker/.test(instance.host)) {
        url = 'http://' + instance.publicIp + ':8041/';
      }

      if (instance.version) {
        var versionClass = '';

        if (instance.version !== results.head.sha) {
          versionClass = 'cell-alert';
        }

        instance.version = sprintf('<span class="%s">' +
            '<a href="https://github.com/Singly/hallway/commit/%s">%s</a>' +
          '</span>',
          versionClass,
          instance.version,
          instance.version.slice(0, 8));
      } else {
        instance.version = '';
      }

      var loadClass = '';

      if (instance.os.loadavg[0] >= 0.8) {
        loadClass = 'cell-alert';
      }

      $('#rows').append(sprintf('<tr>' +
          '<td><a href="%s">%s</a></td>' +
          '<td>%s</td>' +
          '<td>%s</td>' +
          '<td>%s</td>' +
          '<td>%s</td>' +
          '<td>%s</td>' +
          '<td><span class="%s">%s</span></td>' +
          '<td>%s</td>' +
          '<td>%sgb</td>' +
          '<td>%s</td>' +
          '<td>%s</td>' +
        '</tr>',
        url,
        instance.host,
        instance.version,
        moment.duration(instance.uptime, "seconds").humanize(),
        (instance.active ? instance.active : ''),
        (instance.total ? commas(instance.total) : ''),
        (instance.runtime ? (Math.round(instance.runtime * 100) / 100) + 's' : ''),
        loadClass,
        Math.round(instance.os.loadavg[0] * 100) / 100,
        moment.duration(instance.os.uptime, "seconds").humanize(),
        Math.round((instance.os.freemem / 1024 / 1024 / 1024) * 100) / 100,
        instance.publicIp,
        instance.privateIp));
    });
  });
}

$(function () {
  refresh();

  $('#refresh').click(function () {
    refresh();
  });
});
