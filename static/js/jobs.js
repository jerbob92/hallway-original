var states = {
  0: 'waiting',
  1: 'starting',
  2: 'syncing',
  3: 'pipeline'
};

function sortTable() {
  $('table').each(function(index, element) {
    $(element).find('td').filter(function() {
      return $(this).index() === 4;
    }).sortElements(function(a, b) {
      a = parseInt($(a).attr('data-start'), 10);
      b = parseInt($(b).attr('data-start'), 10);

      return a > b ? 1 : -1;
    }, function() {
      return this.parentNode;
    });
  });
}

function refresh() {
  $.getJSON('/workers/state', function(state) {
    $('#rows').html('');

    var i = 0;

    if (state.unresponsive && state.unresponsive.length) {
      $('#unresponsive').text(state.unresponsive.join(', '));

      $('#unresponsive-wrapper').show();
    } else {
      $('#unresponsive').text('');

      $('#unresponsive-wrapper').hide();
    }

    var workerClasses = {};

    _.each(state.workers, function(worker) {
      worker.host = worker.host.replace(/\.singly\.com/, '');
    });

    _.sortBy(state.workers, 'host').forEach(function(worker) {
      i++;

      workerClasses[worker.host] = i;

      Object.keys(worker.workers).forEach(function(pid) {
        worker.workers[pid].tasks.forEach(function(task){
          var classes = [];

          if (task.tstart < Date.now() - (60 * 1000)) {
            classes.push('dawgAlert');
          }

          $('#rows').append('<tr>' +
              '<td><span class="worker worker-' + i + '">' + worker.host + '</span></td>' +
              '<td>' + task.service + '#' + task.synclet + '</td>' +
              '<td>' + task.pid + '</td>' +
              '<td data-start="' + task.tstart + '"><span class="' + classes.join(' ') + '">' + moment(task.tstart).fromNow(true) + '</span></td>' +
              '<td>' + (task.tpipe ? moment(task.tpipe).fromNow(true) : '') + '</td>' +
            '</tr>');
        });
      });
    });

    sortTable();
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
