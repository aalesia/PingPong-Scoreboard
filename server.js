var _ = require('underscore');
var express = require('express');
var app = express.createServer();
var io = require('socket.io').listen(app);
var redis = require('redis').createClient();

app.configure(function() {
    app.set('view engine', 'jade');
    app.set('view options', {
        layout: false,
    });
    app.use(express.static(__dirname + "/static"));
    app.use(express.bodyParser());
});

app.listen(8000);

io.sockets.on('connection', function(socket) {
    socket.on('score_update', function(data) {
        console.log('Update!');
    });
});

var SCOREBOARD = "scoreboard";
var USER_WITH_ID = function(id) { return "user:" + id };
var NEXT_USER_ID = "global:nextUid";

var getUniqueUid = function(callback) {
    redis.incr(NEXT_USER_ID, function(error, result) {
        callback(result);
    });
};

var getScoreboard = function(callback) {
    redis.zrevrange(SCOREBOARD, 0, -1, "WITHSCORES", function(error, scoreboard) {
        var result = [];
        var r = 0;

        // i is the user ID
        // i + 1 is the score
        for (var i = 0; i < scoreboard.length; i += 2) {
            (function(index, rank) {
                redis.hmget(USER_WITH_ID(scoreboard[index]), "name", "games_played", function(error, user) {
                    result.push({
                        id: scoreboard[index],
                        name: user[0],
                        games_played: user[1],
                        score: scoreboard[index + 1],
                        rank: rank,
                    });

                    if (result.length == (scoreboard.length / 2)) {
                        callback(result);
                    }
                });
            })(i, ++r);
        }
    });
};

var updateScores = function(params) {
    var emitUpdates = function(uid) {
        console.log(uid);
        // Increment the games_played value for the user
        redis.hincrby(USER_WITH_ID(uid), 'games_played', 1, function(error, result) {
            getScoreboard(function(scoreboard) {
                io.sockets.emit('board_updated', scoreboard);
            });
        });
    };

    var setScoreForPlayer = function(uid) {
        redis.zscore(SCOREBOARD, uid, function(error, result) {
            // Either increment the user's score or add their first point to
            // the leaderboard
            if (result) {
                redis.zincrby(SCOREBOARD, (uid == params.winner_id) ? 1 : 0, uid, function() { 
                    emitUpdates(uid) 
                });
            } else {
                redis.zadd(SCOREBOARD, (uid == params.winner_id) ? 1 : 0, uid, function() { 
                    emitUpdates(uid) 
                });
            }
        });
    };

    setScoreForPlayer(params.winner_id);
    setScoreForPlayer(params.loser_id);
};

app.get('/', function(request, response) {
    getScoreboard(function(scoreboard) {
        response.render('index', {
            players: scoreboard,
        });
    });
});

app.post('/score', function(request, response) {
    updateScores(request.body);

    response.send(201);
});

app.post('/user', function(request, response) {
    getUniqueUid(function(uid) {
        redis.hmset(USER_WITH_ID(uid), {
            name: request.body.name,
            games_played: 0,
        });
    });

    response.send(201);
});
