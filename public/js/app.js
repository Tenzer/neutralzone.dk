var socket = io.connect();
var tweets_element = document.getElementById('tweets');

socket.on('users', function usersUpdate (data) {
	document.getElementById('status').innerHTML = 'Connected to server. ' +
		'Current users: ' + data.count + '.';
});

socket.on('tweet', function tweetReceived (data) {
	var item = document.createElement('li');
	item.setAttribute('id', 'tweet-' + data.id);
	item.innerHTML = Handlebars.templates.tweet(data);
	tweets_element.insertBefore(item, tweets_element.firstChild);
});

socket.on('delete', function tweetDeleted (data) {
	var tweet = document.getElementById('tweet-' + data.id);
	if (tweet) {
		tweet.parentNode.removeChild(tweet);
	}
});

socket.on('error', function errorDetected (error) {
	document.getElementById('status').innerHTML = 'Lost connection to server.';
	console.log(error);
});

socket.on('time', function timeReceived (data) {
	goFuzzy(data.now);
});
