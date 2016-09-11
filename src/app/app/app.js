(function() {
    "use strict";

    var controllerConnection = new window.webRtcMaster(),
        menuActivated = true,
        firstPause = true,
        inFullScreen = false;

    $(function() {
        var $menuHolder = $('.content.modal'),
            $menuMain = $('.menu.main'),
            $menuRom = $('.menu.rom'),
            $menuLoading = $('.menu.loading'),
            $emulator = $('.emulator');

        var $qrHolder = $(".player-controls .qrcode");
        var url = "<APP DEPLOY ADDR>/controller?id=" + encodeURIComponent(controllerConnection.key) + "&player=";
        console.log(url);
        $qrHolder.each(function (ind) {
            new QRCode($qrHolder[ind],url + ind);
        });

        var nes = new JSNES({
            'ui': $emulator.JSNESUI()
        });

        var players = {};
        controllerConnection.subscribe('controllerState', null, function onMessage(channelLabel, key, message) {
            if (!message)
                return;
            if (!players[key]) {
                players[key] = message.player;
            }
            if (!message.keys)
                return;
            for (var ctrlKey in message.keys) {
                if (!message.keys.hasOwnProperty(ctrlKey) || !nes.keyboard.keys.hasOwnProperty(ctrlKey))
                    continue;
                nes.keyboard.setKeyState(message.player, nes.keyboard.keys[ctrlKey], message.keys[ctrlKey]);
            }
        }, function onUserAdd(key, channelLabel) {

        }, function onUserLost(key, channelLabel) {

        });


        var dbx = new Dropbox({ accessToken: 'ioETuaQldOAAAAAAAAAADMB1S428Yis0YLE0o6YBf1AZXaWaOBLuGy1lZRiWxHUW' });
        dbx.filesListFolder({path: ''})
            .then(function(response) {
                if (response.entries.length <= 0)
                    return;
                var ind = Math.floor(Math.random()*response.entries.length);
                loadRom(response.entries[ind].path_lower, true);
            })
            .catch(function(error) {
                console.log(error);
            });

        /*
         * Keyboard
         */
        $(document).
            bind('keydown', function(evt) {
                if (menuActivated)
                    return;
                nes.keyboard.keyDown(evt);
            }).
            bind('keyup', function(evt) {
                if (menuActivated)
                    return;
                nes.keyboard.keyUp(evt);
            }).
            bind('keypress', function(evt) {
                if (menuActivated)
                    return;
                nes.keyboard.keyPress(evt);
            });

        $emulator.on('click', function() {
            showMenu(true);
        });

        $('.back-btn', $menuHolder).on('click', function() {
            showMenu(true);
        });
        $('.select-btn', $menuHolder).on('click', function() {
            showMenu(false);
        });
        $('.resume-btn', $menuHolder).on('click', hideMenu);

        $('.restart-btn', $menuHolder).on('click', function() {
            nes.reloadRom();
            nes.start();
            hideMenu();
        });
        var soundBtn = $('.sound-btn', $menuHolder).on('click', function() {
                if (nes.opts.emulateSound) {
                    nes.enableSound(false);
                    soundBtn.html('Sound: Off');
                }
                else {
                    nes.enableSound(true);
                    soundBtn.html('Sound: On');
                }
            }),
            $romList = $('.rom.list', $menuRom),
            $romUpload = $('.rom.upload input', $menuRom).change(function (){
                var fileInput = this;
                if(!fileInput.files || fileInput.files.length <= 0)
                    return;

                var file = fileInput.files[0];
                var path = '/' + file.name;
                setLoading();
                dbx.filesUpload({path: path, contents: file})
                    .then(function(response) {
                        loadRom(path);
                        hideMenu();
                    })
                    .catch(function(error) {
                        console.log(error);
                    });

                $romUpload.replaceWith( $romUpload = $romUpload.clone( true ) );
            }),
            $fullScreen = $('.full-screen-btn').on('click', function() {
                if (inFullScreen) {
                    fullScreenCancel();
                } else {
                    fullScreen();
                }
                if (inFullScreen) {
                    $fullScreen.html('Exit Full Screen');
                } else {
                    $fullScreen.html('Full Screen');
                }
            });

        if (!isFullScreenAwailable()) {
            $fullScreen.hide();
        }

        $('.player-controls.player1 .controller-keyboard').on('click', function () {
            setControlType(0, true);
        });
        $('.player-controls.player1 .controller-phone').on('click', function () {
            setControlType(0, false);
        });

        $('.player-controls.player2 .controller-keyboard').on('click', function () {
            setControlType(1, true);
        });
        $('.player-controls.player2 .controller-phone').on('click', function () {
            setControlType(1, false);
        });
        setControlType(0, false);
        setControlType(1, false);

        showMenu(true);

        function hideMenu() {
            firstPause = false;
            $menuHolder.hide();
            if (!nes.isRunning)
                nes.start();

            menuActivated = false;
        }

        function showMenu(main) {
            $menuLoading.hide();
            if (main) {
                $menuMain.show();
                $menuRom.hide();
            } else {
                $menuRom.show();
                $menuMain.hide();
                updateROMList($romList);
            }
            $menuHolder.show();
            if (!firstPause && nes.isRunning)
                nes.stop();

            menuActivated = true;
        }

        function setLoading() {
            $menuLoading.show();
            $menuMain.hide();
            $menuRom.hide();
            $menuHolder.show();
            nes.stop();
        }

        function updateROMList($list) {
            $('<h1>Loading...</h1>').appendTo($list.empty());
            dbx.filesListFolder({path: ''})
                .then(function(response) {
                    $list.empty();
                    response.entries.forEach(function (entitie) {
                        $('<span>'+entitie.name+'</span>').on('click', function() {
                            loadRom(entitie.path_lower);
                        }).appendTo($list);
                    });
                })
                .catch(function(error) {
                    console.log(error);
                });
        }

        function loadRom(path_lower, background) {
            if (!background)
                setLoading();
            dbx.filesDownload({path: path_lower}).then(function (data) {
                var downloadUrl = URL.createObjectURL(data.fileBlob);
                nes.ui.loadROM(downloadUrl);
                if (!background)
                    hideMenu();
            });
        }

        function setControlType(player, isKeyboard) {
            var controls = $('.player-controls.player' + (player + 1));
            if (isKeyboard) {
                $('.keyboard-controls', controls).show();
                $('.qrcode', controls).hide();
                $('.controller-keyboard', controls).addClass('selected-controller');
                $('.controller-phone', controls).removeClass('selected-controller');
            } else {
                $('.keyboard-controls', controls).hide();
                $('.qrcode', controls).show();
                $('.controller-keyboard', controls).removeClass('selected-controller');
                $('.controller-phone', controls).addClass('selected-controller');
            }
        }

        function isFullScreenAwailable() {
            return document.exitFullscreen
                || document.webkitCancelFullScreen
                || document.mozCancelFullScreen
                || document.msExitFullscreen;
        }

        function isFullScreenAwailable() {
            return document.exitFullscreen
                || document.webkitCancelFullScreen
                || document.mozCancelFullScreen
                || document.msExitFullscreen;
        }

        function fullScreen() {
            var docElm = document.documentElement;
            inFullScreen = true;
            if (docElm.requestFullscreen) {
                docElm.requestFullscreen();
            } else if (docElm.mozRequestFullScreen) {
                docElm.mozRequestFullScreen();
            } else if (docElm.webkitRequestFullScreen) {
                docElm.webkitRequestFullScreen();
            } else if (docElm.msRequestFullscreen) {
                docElm.msRequestFullscreen();
            } else {
                inFullScreen = false;
            }
        }

        function fullScreenCancel() {
            inFullScreen = false;
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            } else {
                inFullScreen = true;
            }
        }
    });
})();