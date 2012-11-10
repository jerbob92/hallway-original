$(document).on('click', 'a', function(event) {
  var href = $(event.target).attr('href');
  // only loca urls
  if (href.indexOf('/') !== 0) return;
  // only pages (they have a back button on them!)
  if (href.indexOf('.html') !== href.length - 5) return;

  // Stop the default behavior of the browser, which
  // is to change the URL of the page.
  event.preventDefault();

  // Manually change the location of the page to stay in
  // 'Standalone' mode and change the URL at the same time.
  location.href = href;
});
