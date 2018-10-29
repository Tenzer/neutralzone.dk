/*jshint node: true */

'use strict';


/* Modules */

var redis = require('redis');
var socketio = require('socket.io');
var ntwitter = require('immortal-ntwitter');


/* Settings */

try {
    var config = require(__dirname + '/config.json');
} catch (e) {
    console.error('Error reading config.json: %s\nQuitting!', e.message);
    process.exit(1);
}


/* Redis */

var db = redis.createClient();

function storeTweet (tweet) {
    db.zadd('nz:tweets', tweet.timestamp, JSON.stringify(tweet), function afterSave (error) {
        if (error) {
            return console.error('Error saving tweet: %s', error);
        }

        db.hset('nz:ids', tweet.id_str, tweet.timestamp, function afterSaveId (error) {
            if (error) {
                return console.error('Error saving tweet ID: %s', error);
            }
        });
    });
}

function deleteTweet (tweet_id) {
    db.hget('nz:ids', tweet_id, function deleteTweetRedisReply (error, timestamp) {
        if (error) {
            return console.error('Error when getting timestamp for tweet to be deleted (ID %s): %s', tweet_id, error);
        }

        if (!timestamp) {
            return console.log('Timestamp was not found for tweet with ID %s, which was requested deleted.', tweet_id);
        }

        db.hdel('nz:ids', tweet_id);
        db.zremrangebyscore('nz:tweets', timestamp, timestamp);
    });
}

// Used to strip data from the tweet the frontend doesn't need
function formatTweet (tweet) {
    if (typeof tweet === 'string') {
        tweet = JSON.parse(tweet);
    }

    var retweet;
    if (tweet.retweeted_status) {
        retweet = {
            name: tweet.user.name,
            screen_name: tweet.user.screen_name
        };
        tweet.retweeted_status.timestamp = tweet.timestamp;
        tweet = tweet.retweeted_status;
    }

    var t = {
        id: tweet.id_str,
        screen_name: tweet.user.screen_name,
        name: tweet.user.name,
        timestamp: tweet.timestamp,
        text: renderTweet(tweet),
        retweet: retweet
    };

    if (tweet.user.profile_image_url_https) {
        t.pic_url = tweet.user.profile_image_url_https;
    } else {
        t.pic_url = 'images/no-picture.png';
    }

    return t;
}


/* Socket.IO */

var io = socketio(config.listen_port);
var clients = 0;

io.on('connection', function clientConnected (socket) {
    // Sends out new user count when a new client is connected
    clients++;
    socket.emit('users', clients);
    socket.broadcast.emit('users', clients);

    // Sends out new user count when a client disconnect
    socket.on('disconnect', function clientDisconnected () {
        clients--;
        socket.broadcast.emit('users', clients);
    });

    socket.on('gettweets', function sendTweets (data) {
        if (data.type === 'newer' && data.date === 0) {
            // Send the 10 latest tweets to the user
            db.zrange('nz:tweets', -10, -1, function sendLatestTweets (error, tweets) {
                if (error) {
                    return console.error('Error getting tweets to send to client: %s', error);
                }

                socket.emit('newtweets', tweets.map(formatTweet));

                // Sends out the server time to the new client, this calls goFuzzy()
                socket.emit('time', new Date().getTime());
            });
        } else if (data.type === 'newer' && data.date !== 0) {
            // Send whichever tweets has come in since the client got tweets last time
            db.zrangebyscore('nz:tweets', data.date + 1, '+inf', function sendLatestTweets (error, tweets) {
                if (error) {
                    return console.error('Error getting tweets to send to client: %s', error);
                }

                socket.emit('newtweets', tweets.map(formatTweet));

                // Sends out the server time to the new client, this calls goFuzzy()
                socket.emit('time', new Date().getTime());
            });
        } else if (data.type === 'older') {
            console.log('Client requested tweets older than', data.date);
            // Send up to 10 older tweets to the client
            db.zrevrangebyscore('nz:tweets', data.date - 1, '-inf', 'LIMIT', 0, 10, function sendArchivedTweets (error, tweets) {
                if (error) {
                    return console.error('Error getting tweets to send to client: %s', error);
                }

                socket.emit('oldtweets', tweets.map(formatTweet));

                // Sends out the server time to the new client, this calls goFuzzy()
                socket.emit('time', new Date().getTime());
            });
        }
    });
});


/* Twitter */

var twitter = ntwitter.create(config.oauth_credentials);

twitter.verifyCredentials(function testCredentials (error) {
    if (error) {
        console.error('Error verifying Twitter credentials: %s\nQuitting!', error);
        process.exit(1);
    }
});

var filter = {};
if (config.follow) {
    filter.follow = config.follow.join(',');
}
if (config.track) {
    filter.track = config.track.join(',');
}

twitter.immortalStream('statuses/filter', filter, function twitterStream (ts) {
    ts.on('data', function processNewTweet (tweet) {
        if (!tweet.user) {
            console.log('This tweet does not have a user object: ' + JSON.stringify(tweet));
            return;
        }

        if (tweet.in_reply_to_user_id && !tweet.retweeted_status) {
            // Ignore replies, unless they are retweets
            return;
        }

        if (tweet.retweeted_status) {
            if (config.follow.indexOf(tweet.user.id) === -1) {
                // Ignore retweets from accounts not followed
                return;
            } else if (config.follow.indexOf(tweet.retweeted_status.user.id) !== -1) {
                // Ignore retweets of accounts we follow, to avoid duplicate tweets
                return;
            }
        }

        tweet.timestamp = Date.now();
        io.emit('newtweets', formatTweet(tweet));
        storeTweet(tweet);
    });

    ts.on('delete', function deleteTweetRequest (tweet) {
        // We both get an object and a string whenever a tweet is deleted.
        if (typeof tweet === 'object') {
            io.emit('delete', { id: tweet.status.id_str });
            deleteTweet(tweet.status.id_str);
        }
    });

    ts.on('limit', function limitReceived (data) {
        console.log('Limit event received, content: %s', data);
    });

    ts.on('scrub_geo', function scrubGeoReceived (data) {
        console.log('Scrub Geo event received, content: %s', data);
    });
});


/* Rendering */

function renderTweet (tweet) {
    if (tweet.truncated) {
        var text = tweet.extended_tweet.full_text;
        var entities = tweet.extended_tweet.entities;
    } else {
        var text = tweet.text;
        var entities = tweet.entities;
    }

    // Find out if tweet already has links
    if (text.indexOf('</a>') !== -1) {
        // It has, so don't create our own links
        return text;
    }

    // URLs
    var i, entity;
    if (entities.urls) {
        entities.urls.forEach(function renderUrls (item) {
            text = text.replace(item.url, '<a href="' + item.url + '">' + item.display_url + '</a>');
        });
    }

    // Media
    if (entities.media) {
        entities.media.forEach(function renderMedia (item) {
            text = text.replace(item.url, '<a href="' + item.url + '">' + item.display_url + '</a>');
        });
    }

    // Users
    if (entities.user_mentions) {
        entities.user_mentions.forEach( function renderUsers (item) {
            text = text.replace('@' + item.screen_name, '<a href="https://twitter.com/intent/user?screen_name=' + item.screen_name + '">@' + item.screen_name + '</a>');
        });
    }

    // Hashtags
    if (entities.hashtags) {
        entities.hashtags.forEach(function renderHashtags (item) {
            text = text.replace('#' + item.text, '<a href="https://twitter.com/search/%23' + item.text + '">#' + item.text + '</a>');
        });
    }

    return text;
}


/* Update time since */

// Time is pushed from the server to the clients
// This is in order to avoid clients with wrong time settings
setInterval(function updateTime () {
    io.emit('time', new Date().getTime());
}, 15000);
