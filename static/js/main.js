$(document).ready(function() {
	var onWinClick = function() {
		var that = this;

		jConfirm("Are you sure?", "Winner", function(finished) {
			console.log(finished);
			if(finished == true) {
				var count = $(".game_player").length;
				console.log(count);
				if(count == 2) {
					console.log("submit");
					var game = $("#current_game");
					var winner = $(that).attr("id").replace("\n", "");
					var loser;
					var count = 0;
		
					var players = document.querySelectorAll(".game_player");
					[].forEach.call(players, function(player) {
						var playerId = $(player).attr("id").replace("\n", "");
						console.log(player);
						if(playerId != winner) {
							loser = playerId;
						}

						count++;

						if(count == 2) {
							$.post("game", { winner:winner, loser:loser }, function(data) {
								$(game).empty();
							});
						}
					});
				}
			}
		});
	};

	$(".player").bind("dragstart", function() {
		$(this).css("color", "blue");
	});

	$(".player").bind("dragend", function() {
		$(this).css("color", "red");
	});

	$(".player_container").bind("click", function() {
		var email = $(this).children(".email").text();
		var id = $(this).children(".id").text();
		console.log(email);

		var game = $("#current_game");
		var count = $(".game_player").length;

		if(count < 2) {
			if(count == 1) {
				game.append("<image class='vs' src='/images/vs.jpeg' />");
			}

			var avatar = $(this).children(".avatar").attr("src").replace("\n", "");
			game.append("<image class='game_player' src="+ avatar+"?s=200 id='"+id+"'/>");

			var players = document.querySelectorAll(".game_player");
			[].forEach.call(players, function(player) {
  				player.addEventListener('click', onWinClick, false);
			});
		}
	});
});