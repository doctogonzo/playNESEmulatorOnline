(function() {
    "use strict";

    var key = getQueryVariable('id');
    var player = getQueryVariable('player');
    var controllerConnection = key ? new window.webRtcSlave(key) : null;

    var botAng = Math.tan(Math.PI*(0.25 - 0.1));
    var topAng = Math.tan(Math.PI*(0.25 + 0.1));

    $(function() {

        var contols = {
                KEY_A: $('#KEY_A'),
                KEY_B: $('#KEY_B'),
                KEY_SELECT: $('#KEY_SELECT'),
                KEY_START: $('#KEY_START'),
                KEY_UP: $('.key-up-img'),
                KEY_DOWN: $('.key-down-img'),
                KEY_LEFT: $('.key-left-img'),
                KEY_RIGHT: $('.key-right-img')
            },
            $document = $(document).each(function () {
                this.addEventListener("touchcancel", onKey);
                this.addEventListener("touchend", onKey);
                this.addEventListener("touchstart", onKey);
                this.addEventListener("touchmove", onKey);
            });

        document.body.addEventListener('touchmove', function(event) {
            event.preventDefault();
        }, false);

        controllerConnection.sendMessage('controllerState', {
            player: player
        });

        function onKey(e) {
            var currKeys = {
                KEY_A: 0x40,
                KEY_B: 0x40,
                KEY_SELECT: 0x40,
                KEY_START: 0x40,
                KEY_UP: 0x40,
                KEY_DOWN: 0x40,
                KEY_LEFT: 0x40,
                KEY_RIGHT: 0x40
            };

            if (e.targetTouches) {
                var width = $document.width(),
                    height = $document.height();

                for (var i = 0; i < e.touches.length; i++) {
                    var touch = e.touches[i];
                    if (!touch)
                        continue;

                    if (touch.pageX < width / 2) {
                        sendMoveKey(touch, width / 4, height / 2, width / 2, height, currKeys)
                    } else {
                        sendKey(touch, width * 0.75, height / 2, currKeys);
                    }
                }
            }

            updateKeys(currKeys);
        }

        function sendMoveKey(touch, cx, cy, width, height, currKeys) {
            var rx = touch.pageX - cx,
                ry = touch.pageY - cy;

            if (Math.sqrt(rx*rx + ry*ry) <= Math.min(width, height) * 0.05) {
                currKeys.KEY_UP = currKeys.KEY_DOWN = currKeys.KEY_LEFT = currKeys.KEY_RIGHT = 0x41;
                return;
            }

            var ang = Math.abs(ry/rx);
            if (ang < topAng) {
                if (rx > 0)
                    currKeys.KEY_RIGHT = 0x41;
                else
                    currKeys.KEY_LEFT = 0x41;
            }
            if (ang > botAng) {
                if (ry > 0)
                    currKeys.KEY_DOWN = 0x41;
                else
                    currKeys.KEY_UP = 0x41;
            }
        }

        function sendKey(touch, cx, cy, currKeys) {
            var rx = touch.pageX - cx,
                ry = touch.pageY - cy;

            if (ry < 0) {
                if (rx < 0) {
                    currKeys.KEY_SELECT = 0x41;
                } else {
                    currKeys.KEY_START = 0x41;
                }
            } else {
                if (rx < 0) {
                    currKeys.KEY_B = 0x41;
                } else {
                    currKeys.KEY_A = 0x41;
                }
            }
        }

        var sendKeys = {};
        function updateKeys(keys) {
            var keysNew = false,
                approvedKeys = {};
            for (var key in keys) {
                if (!keys.hasOwnProperty(key) || !contols.hasOwnProperty(key))
                    continue;
                if (keys[key] === 0x40) {
                    contols[key].removeClass('pushed');
                } else {
                    contols[key].addClass('pushed');
                }
                if (sendKeys[key] !== keys[key]) {
                    keysNew = true;
                    approvedKeys[key] = sendKeys[key] = keys[key];
                }
            }
            if (keysNew)
                controllerConnection.sendMessage('controllerState', {
                    player: player,
                    keys: approvedKeys
                });
        }
    });

    function getQueryVariable(variable)
    {
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i=0;i<vars.length;i++) {
            var pair = vars[i].split("=");
            if(pair[0] == variable){return decodeURIComponent(pair[1]);}
        }
        return(false);
    }

})();