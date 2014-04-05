var socket = io.connect();
var tweets_element = document.getElementById('tweets');
var newest_tweet_date = 0;
var oldest_tweet_date = 0;
var loadmore = document.getElementById('loadmore');

socket.on('connect', function connectionEstablished () {
    socket.emit('gettweets', {
        type: 'newer',
        date: newest_tweet_date
    });
    loadmore.setAttribute('style', null);
});

socket.on('users', function usersUpdate (count) {
    document.getElementById('status').textContent = 'Connected to server. Current users: ' + count + '.';
});

function addTweet (tweet, type) {
    var item = document.createElement('li');
    item.setAttribute('id', 'tweet-' + tweet.id);
    item.innerHTML = Handlebars.templates.tweet(tweet);

    if (document.getElementById('tweet-' + tweet.id)) {
        // Tweet already exists on page
        return;
    }

    if (type === 'new') {
        tweets_element.insertBefore(item, tweets_element.firstChild);
    } else if (type === 'old') {
        tweets_element.appendChild(item);
    }

    if (tweet.timestamp > newest_tweet_date) newest_tweet_date = tweet.timestamp;
    if (oldest_tweet_date === 0 || tweet.timestamp < oldest_tweet_date) oldest_tweet_date = tweet.timestamp;
}

function getOldTweets () {
    socket.emit('gettweets', {
        type: 'older',
        date: oldest_tweet_date
    });
}

socket.on('newtweets', function tweetsReceived (data) {
    if (data instanceof Array) {
        data.forEach(function (tweet) {
            addTweet(tweet, 'new');
        });
    } else {
        addTweet(data, 'new');
    }
});

socket.on('oldtweets', function oldTweetsReceived (data) {
    data.forEach(function (tweet) {
        addTweet(tweet, 'old');
    });

    if (data.length < 10) {
        // Indication that we have reached the max of tweets we are able to load
        loadmore.textContent = 'No more tweets available';
        loadmore.className = loadmore.className + ' nomoretweetsavailable';
    }
});

socket.on('delete', function tweetDeleted (data) {
    var tweet = document.getElementById('tweet-' + data.id);
    if (tweet) {
        tweet.parentNode.removeChild(tweet);
    }
});

socket.on('error', function errorDetected (error) {
    document.getElementById('status').textContent = 'Lost connection to server.';
    loadmore.setAttribute('style', 'display: none');

    if (error) {
        console.log(error);
    }
});

socket.on('time', function timeReceived (time) {
    goFuzzy(time);
});
