var mongoose = require('mongoose');
var express = require('express');
mongoose.connect('mongodb://localhost/pingpong-DB');
var app = require('express').createServer()
	, io = require('socket.io').listen(app);
var redis = require('redis').createClient();
var crypto = require('crypto');

var leaderboardDB = "Leaderboard";

app.configure(function() {
    app.set('view engine', 'jade');
    app.set('view options', {
        layout: false,
    });
    app.use(express.bodyParser());
});

app.configure('development', function(){
    app.use(express.static(__dirname + '/static'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  var oneYear = 31557600000;
  app.use(express.static(__dirname + '/static', { maxAge: oneYear }));
  app.use(express.errorHandler());
});

app.listen(3000);

io.sockets.on('connection', function(socket) {
	console.log('Connected');
});

var Schema = mongoose.Schema
	, ObjectId = Schema.ObjectId;
	
var PlayerSchema = new Schema({
	  email		: { type: String, required: true, unique: true }
	, name		: { type: String, required: true }
	, hash		: { type: String }
});

var GameSchema = new Schema({
	  winner	: { type: String, required: true }
	, loser		: { type: String, required: true }
	, date		: { type: Date, default: Date.now }
});

PlayerSchema.methods.winCount = function(callback) {
	var that = this;
	
	Game.find({winner:this._id}, function(err, docs){
		console.log('%s total wins: %s', that._id, docs.length);
		return callback(docs.length);
	});
};

PlayerSchema.methods.loseCount = function(callback) {
	var that = this;
	
	Game.find({loser:this._id}, function(err, docs) {
		console.log('%s total losses: %s', that._id, docs.length);
		return callback(docs.length);
	});
};

PlayerSchema.methods.winsAgainstPlayer = function(opponent, callback) {
	var that = this;
	
	Game
	.find({winner:this._id, loser:opponent}, function(err, docs) {
		console.log('%s total wins vs %s: %s', that._id, opponent, docs.length);
		return callback(docs.length);
	});
};

PlayerSchema.methods.lossesAgainstPlayer = function(opponent, callback) {
	var that = this;
	
	Game
	.find({loser:this._id, winner:opponent}, function(err, docs) {
		console.log('%s total losses vs %s: %s', that._id, opponent, docs.length);
		return callback(docs.length);
	});
};

var Game = mongoose.model('GameSchema', GameSchema);
var Player = mongoose.model('PlayerSchema', PlayerSchema);

var getPlayers = function(callback) {
	Player.find({}, function (err, docs) {
		return callback(docs);
	})
};

var getPlayer = function(uid, callback) {
	Player.findById(uid, function (err, docs) {
		return callback(docs);
	})
};

var addPlayer = function(email, name, callback) {
	var md5crypto = crypto.createHash('md5');
	md5crypto.update(email);

	var player = new Player({ email: email, name: name, hash: md5crypto.digest('hex')});
	player.save(function(err){
		return callback(player);
	});
};

var addGame = function(game, callback) {
	var game = new Game({ winner: game.winner, loser: game.loser});
	game.save(function(err){
		return callback(game);
	});
};

var getLeaderboard = function(callback) {
	redis.zrevrange(leaderboardDB, 0, -1, "WITHSCORES", function(error, leaderboard) {
		console.log(leaderboard);
		var result = [];
		var r = 0;

		if (leaderboard.length == 0) {
			return callback(result);
		}

		for (var i = 0; i < leaderboard.length; i += 2) {
			(function(index, rank) {
				getPlayer(leaderboard[index], function(player) {
					result.push({
						id: leaderboard[index],
						name: player.name,
						rank: rank,
						wins: leaderboard[index + 1],
					});

					if(result.length == leaderboard.length / 2) {
						return callback(result);
					}
 				});
			})(i, ++r);
		}
	});
};

var updateLeaderboard = function(uid, callback) {
	var emitUpdates = function() {
		getLeaderboard(function(leaderboard) {
			callback(leaderboard);
		});
	};

	redis.zscore(leaderboardDB, uid, function(error, result) {
		if (result) {
			redis.zincrby(leaderboardDB, 1, uid, function() { 
				emitUpdates() 
            });
		} else {
			redis.zadd(leaderboardDB, 1, uid, function() { 
               	emitUpdates() 
           	});
		}
	});
};

app.get('/player', function(request, response){
	getPlayers(function(players) {
	    response.render('players', {
	    	players:players
	    });
	});
});

app.get('/player/:id', function(request, response){
	getPlayer(request.params.id, function(player) {
		console.log(player);
	    response.render('player', {
	    	player:player
	    });
	});
});

app.post('/player', function(request, response) {
	addPlayer(request.body.email, request.body.name, function(player) {
		console.log(player);
		io.sockets.emit('new_player', player);
	});
});

app.get('/', function(request, response) {
	getLeaderboard(function(leaderboard) {
		getPlayers(function(players) {
			response.render('main', {
				leaderboard:leaderboard,
				players:players
			});
		});
	});
});

app.post('/game', function(request, response) {
	addGame(request.body, function(game) {
		console.log(game);		

		updateLeaderboard(game.winner, function(leaderboard) {
			console.log(leaderboard);
			io.sockets.emit('leaderboard_update', leaderboard);

			response.send(201);
		});
	});
});

//API calls

app.get('/api/player', function(request, response){
	getPlayers(function(players) {
	    response.render('players', {
	    	players:players
	    });
	});
});

app.get('/api/player/:id', function(request, response){
	getPlayer(request.params.id, function(player) {
		console.log(player);
	    response.render('player', {
	    	player:player
	    });
	});
});

app.post('/api/player', function(request, response) {
	addPlayer(request.body.email, request.body.name, function(player) {
		console.log(player);
		io.sockets.emit('new_player', player);
		
		response.send(201);
	});
});

app.get('/api/leaderboard', function(request, response) {
	getLeaderboard(function(leaderboard) {
		response.render('leaderboard', {
			leaderboard:leaderboard
		});
	});
});

app.post('/api/game', function(request, response) {
	addGame(request.body, function(game) {
		console.log(game);		

		updateLeaderboard(game.winner, function(leaderboard) {
			console.log(leaderboard);
			io.sockets.emit('leaderboard_update', leaderboard);
		
			response.send(201);
		});
	});
});

/*
var p1 = new Player({ email: 'anthony.alesia@vokalinteractive.com', name: 'anthony.alesia'});
p1.save();

var p2 = new Player({ email: 'bill.best@vokalinteractive.com', name: 'bill.best'});
p2.save();

var p3 = new Player({ email: 'nick.ross@vokalinteractive.com', name: 'nick.ross'});
p3.save();

var p4 = new Player({ email: 'andy.mac@vokalinteractive.com', name: 'andy.mac'});
p4.save();

var g1 = new Game({ winner: p1.email, loser: p2.email});
g1.save();

var g2 = new Game({ winner: p1.email, loser: p2.email});
g2.save();

var g3 = new Game({ winner: p1.email, loser: p2.email});
g3.save();

var g4 = new Game({ winner: p2.email, loser: p1.email});
g4.save();

var g5 = new Game({ winner: p3.email, loser: p4.email});
g5.save();

var g6 = new Game({ winner: p3.email, loser: p4.email});
g6.save();

var g7 = new Game({ winner: p3.email, loser: p4.email});
g7.save();

var g8 = new Game({ winner: p3.email, loser: p4.email});
g8.save();

var g9 = new Game({ winner: p3.email, loser: p4.email});
g9.save();

var g10 = new Game({ winner: p4.email, loser: p3.email});
g10.save();

var g11 = new Game({ winner: p4.email, loser: p3.email});
g11.save();

var g12 = new Game({ winner: p4.email, loser: p3.email});
g12.save();

var g13 = new Game({ winner: p3.email, loser: p1.email});
g13.save();

var g14 = new Game({ winner: p3.email, loser: p2.email});
g14.save();

var g15 = new Game({ winner: p1.email, loser: p4.email});
g15.save();


p3.winCount(function(length){console.log('wins: %s', length);});
p2.loseCount(function(length){console.log('losses: %s', length);});
p1.winsAgainstPlayer(p2._id, function(length){console.log('wins: %s', length);});
p4.lossesAgainstPlayer(p3._id, function(length){console.log('losses: %s', length);});
*/