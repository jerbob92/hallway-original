$(function() {
  $.getJSON("https://api.singly.com/services", function render(data) {
    if (typeof data !== 'object') {
      return window.alert(data);
    }

    Object.keys(data).forEach(function(service) {
      var i = data[service];

      if (!Array.isArray(i.icons)) {
        return;
      }

      var html = '<tr>' +
        '<td>' + i.name + '</td>' +
        '<td>' + service + '</td>';

      i.icons.forEach(function(icon){
        html += '<td><a href="' + icon.source + '"><img src="' + icon.source +
          '" /></a></td>';
      });

      html += '</tr>';

      $('#rows').append(html);
    });
  });
});
