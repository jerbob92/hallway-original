var pid;

function htmlEntities(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refresh() {
  $.getJSON('/profiles/tasks?pid=' + pid, function(tasks) {
    $('#rows').html('');

    Object.keys(tasks).forEach(function(taskid) {
      var task = tasks[taskid];
      var classes = [];

      if (task.at < Date.now()) {
        classes.push('dawgAlert');
      }

      var lastRun = task.tdone? moment(task.tdone).fromNow(true) : undefined;
      $('#rows').append('<tr>' +
          '<td><span class="worker">' + task.service + '#' + task.synclet + '</span></td>' +
          '<td>' + (lastRun? lastRun + ' <span class="actualRunTime">(' + moment(task.tdone).format("MMM DD h:mm:ss") + ')</span>': 'never run') + '</td>' +
          '<td><span class="' + classes.join(' ') + '">' + moment(task.at).fromNow(true) + '</span></td>' +
          '<td>' + task.count + '</td>' +
          '<td>' + htmlEntities(JSON.stringify(task.err)) + '</td>' +
        '</tr>');
    });
  });
}

function setpid() {
  pid = window.prompt("id@service");

  if (!pid) return;

  $('#pid').prop('value', pid);

  refresh();
}

function run() {
  $('#rows').html('');

  $.getJSON('/run/' + pid, refresh);
}

function retask() {
  $('#rows').html('');

  $.getJSON('/profiles/retask?pid=' + pid, refresh);
}

$(function() {
  setpid();

  $('#pid').click(function() {
    setpid();
  });

  $('#refresh').click(function() {
    refresh();
  });

  $('#run').click(function() {
    run();
  });

  $('#retask').click(function() {
    retask();
  });
});
