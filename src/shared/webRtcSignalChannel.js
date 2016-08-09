(function() {
    "use strict";

    var scaledroneLoaded = $.Deferred();
    $.getScript( "https://cdn.scaledrone.com/scaledrone.min.js", function( data, textStatus, jqxhr ) {
        var drone = new ScaleDrone('zjfWz5D7BUNHZhvX');
        drone.on('open', function(error) {
            if (error)
                console.error(error);
            scaledroneLoaded.resolve(drone);
        });
    });

    var webRtcSignalChannel = window.webRtcSignalChannel = function(key) {
        this.id = guid();
        this.room = $.Deferred();
        this.roomId = key || this.id;
    };

    webRtcSignalChannel.prototype = {
        init: function(callbacks) {
            var that = this;
            scaledroneLoaded.done(function(drone) {
                var room = drone.subscribe(that.roomId);
                room.on('open', function (error) {
                    if (error) return console.error(error);
                    if (typeof callbacks.onInit === 'function')
                        callbacks.onInit(that.roomId);
                    that.room.resolve(room, drone);
                });
                room.on('data', function (data) {
                    if (!data || !data.id || data.id === that.id) //invalid msg
                        return;
                    console.log(data);
                    if (data.offer) //offer answer
                        callbacks.onOffer(data.id, data.offer);
                    if (data.iceClient)
                        callbacks.onICe(data.id, data.iceClient);
                });
            });
        },
        sendOffer: function(offer, iceClient) {
            var that = this;
            this.room.done(function (room, drone) {
                drone.publish({
                    room: that.roomId,
                    message: {
                        id: that.id,
                        offer: offer,
                        iceClient: iceClient
                    }
                });
            });
        },
        sendIceClient: function(iceClient) {
            var that = this;
            this.room.done(function (room, drone) {
                drone.publish({
                    room: that.roomId,
                    message: {
                        id: that.id,
                        iceClient: iceClient
                    }
                });
            });
        },
        stop: function() {
            this.room.done(function (room) {
                room.unsubscribe();
            });
        }
    };

    function guid() {
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }

    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
})();