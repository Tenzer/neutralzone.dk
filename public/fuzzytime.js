function goFuzzy () {
  var now = new Date().getTime();
  var list = document.body.getElementsByTagName('time');
  for (var i = 0; i < list.length; i++) {
    var time = Date.parse(list[i].getAttribute('datetime'));

    list[i].innerHTML = Math.round((now - time) / 1000) + ' seconds ago';
  }
}
