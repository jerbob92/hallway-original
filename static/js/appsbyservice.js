function refresh() {

  $('#rows').html('');

  var options = {};

  $.getJSON('/appsbyservice', options, function(table) {
    Object.keys(table).forEach(function(key) {
      $('#rows').append('<tr>' +
                        '<td>' + key + '</td>' +
                        '<td>' + table[key] + '</td>' +
                        '</tr>');
    });
  });
}

$(function() {
  refresh();
});
