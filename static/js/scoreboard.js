window.renderScoreboard = function(players) {
    var socket = io.connect('http://localhost');

    var Player = Backbone.Model.extend();

    var PlayerCollection = Backbone.Collection.extend({
        model: Player,

        initialize: function() {
            _.bindAll(this, 'withId', 'addOrUpdate');
        },

        comparator: function(player) {
            return player.get('rank');
        },

        withId: function(id) {
            return this.filter(function(player) {
                return player.get('id') == id;
            });
        },

        addOrUpdate: function(player) {
            var result = this.withId(player.id);

            // If we get no results back add the player, otherwise update
            // the result.
            if (result.length != 1) {
                this.add(player);
            } else {
                result[0].set(player);
            }
        }
    });
    
    var playerList = new PlayerCollection();

    var PlayerView = Backbone.View.extend({
        tagName: 'tr',

        initialize: function() {
            _.bindAll(this, 'render');

            this.model.bind('change', this.render, this);
        },

        render: function() {
            $(this.el).html(ich.player({
                rank: this.model.get('rank'),
                name: this.model.get('name'),
                score: this.model.get('score'),
                games_played: this.model.get('games_played'),
            }));

            return this;
        },
    });

    var ScoreboardView = Backbone.View.extend({
        el: $('table'),

        initialize: function() {
            _.bindAll(this, 'render', 'addOne');

            playerList.bind('add', this.addOne);

            this.render();
        },

        render: function() {
            playerList.each(this.addOne);
        },

        addOne: function(player) {
            var view = new PlayerView({ model: player });
            this.el.append(view.render().el);
        },
    });

    var App = new ScoreboardView();

    socket.on('board_updated', function(scoreboard) {
        _.each(scoreboard, function(player) {
            playerList.addOrUpdate(player);
        });
    });

    playerList.add(players);
};
