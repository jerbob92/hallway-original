function refresh() {

  $('#rows').html('');

  var options = {};

  $.getJSON('/productionappsbyday', options, function(apps) {
    var total = 0;
    apps.forEach(function(day) {
      if (!day.day) {
        day.day = '';
      } else {
        day.day = moment(day.day).format("M/D/YYYY");
      }

      total += parseInt(day.accountCount,10);

      $('#rows').append('<tr>' +
                        '<td>' + day.day + '</td>' +
                        '<td>' + day.appCount  + '</td>' +
                        '</tr>');
    });

    $('#rows').append('<tr>' +
                      '<td>' + "TOTAL" + '</td>' +
                      '<td>' + total  + '</td>' +
                      '</tr>');
  });
}

$(function() {
  refresh();
});
