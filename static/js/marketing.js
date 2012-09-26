/*globals commas:true*/

function refresh() {
  $.getJSON('http://graph.facebook.com/singlyinc', function(facebook) {
    $('#facebook-likes').text(facebook.likes);
  });

  $.getJSON('/reports/languages-formatted.json', function(languages) {
    languages = _.first(languages, 10);

    languages.forEach(function(language) {
      $('#language-rows').append(sprintf('<tr>' +
          '<td>%s</td>' +
          '<td>%s</td>' +
        '</tr>', language.id, commas(language.count)));
    });
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
