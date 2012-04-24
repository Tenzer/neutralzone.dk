function goFuzzy (now) {
  var list = document.body.getElementsByTagName('time');

  for (var i = 0; i < list.length; i++) {
    var time = Date.parse(list[i].getAttribute('datetime'));
    var diff = Math.round((now - time) / 1000);

    if (diff < 60) {
      list[i].innerHTML = 'Less than a minute ago';
    } else if (diff < 120) {
      list[i].innerHTML = '1 minute ago';
    } else if (diff < 3600) {
      list[i].innerHTML = Math.floor(diff / 60) + ' minutes ago';
    } else if (diff < 7200) {
      list[i].innerHTML = '1 hour ago';
    } else if (diff < 86400) {
      list[i].innerHTML = Math.floor(diff / 3600) + ' hours ago';
    } else if (diff < 172800) {
      list[i].innerHTML = '1 day ago';
    } else {
      list[i].innerHTML = Math.floor(diff / 86400) + ' days ago';
    }
  }
}
