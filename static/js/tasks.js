var pid;

function setpid() {
  pid = window.prompt("id@service");
  if(!pid) return;
  $('#pid').prop('value',pid);
  refresh();
}

function refresh() {
  $.getJSON('/profiles/tasks?pid='+pid, function(tasks) {
    $('#rows').html('');

    Object.keys(tasks).forEach(function(taskid) {
      var task = tasks[taskid];
      var classes = [];

      if (task.at < Date.now()) {
        classes.push('dawgAlert');
      }

      $('#rows').append('<tr>' +
          '<td><span class="worker">' + task.service + '#' + task.synclet + '</span></td>' +
          '<td>' + moment(task.tdone).fromNow(true) + ' <span class="actualRunTime">(' + moment(task.tdone).format("MMM DD h:mm:ss") + ')</span></td>' +
          '<td><span class="' + classes.join(' ') + '">' + moment(task.at).fromNow(true) + '</span></td>' +
          '<td>' +  task.count + '</td>' +
          '<td>' +  JSON.stringify(task.err) + '</td>' +
        '</tr>');
    });
  });
}

function run() {
  $('#rows').html('running');
  $.getJSON('/run/'+pid, refresh);
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
});
