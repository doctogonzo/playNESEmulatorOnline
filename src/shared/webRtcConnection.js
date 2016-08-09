(function() {
    "use strict";

    var webRtcChannels = function(pc, callbacks) {
        this.channels = {};
        this.channelsPromises = {};
        this.callbacks = callbacks || {};
        var that = this;
        pc.ondatachannel = function(event) {
            that._addChannel(event.channel);
        };
    };

    webRtcChannels.prototype = {
        _addChannel: function(channel) {
            var exChannel = this.channels[channel.label];
            if (exChannel) {
                if (!this.isInitiator)
                    this.closeChannel(channel.label);
                else
                    return exChannel;
            }
            this.channels[channel.label] = channel;
            var deferred = $.Deferred();
            var promise = deferred.promise();
            this.channelsPromises[channel.label] = promise;
            var callbacks = this.callbacks,
                that = this;
            channel.onmessage = function(event) {
                !callbacks.onMessage || callbacks.onMessage(channel.label, !event || !event.data || JSON.parse(event.data));
            };
            channel.onopen = function(event){
                !callbacks.onOpen || callbacks.onOpen(channel.label, event);
                deferred.resolve(channel);
            };
            channel.onclose = function(event){
                !callbacks.onClose || callbacks.onClose(channel.label, event);
                that._removeChannel(channel);
            };
            return promise;
        },
        _removeChannel: function(channel) {
            channel.onmessage = null;
            channel.onopen = null;
            channel.onclose = null;
            delete this.channels[channel.label];
        },
        _free: function() {
            this.callbacks = {};
            for (var i in this.channels) {
                if (this.channels.hasOwnProperty(i))
                    this._removeChannel(this.channels[i]);
            }
            for (var j in this.channelsPromises) {
                if (!this.channelsPromises.hasOwnProperty(j))
                    continue;
                this.channelsPromises[j].reject();
                delete this.channelsPromises[j];
            }
        },
        getChannel: function(pc, label) {
            return this.channelsPromises[label] || this._addChannel(pc.createDataChannel(label));
        },
        closeChannel: function(label) {
            var channel = this.channels[label];
            this._removeChannel(channel);
            channel.close();
        }
    };

    var webRtcConnection = function(callbacks) {
        var pc = this.pc = new RTCPeerConnection();
        this.channels = new webRtcChannels(pc, callbacks);
        var pcReady = $.Deferred();
        this.pcReady = pcReady.promise();
        pc.oniceconnectionstatechange = function() {
            switch (pc.iceConnectionState) {
                case 'checking': {
                    !callbacks || !callbacks.connected || callbacks.onConnectionReady();
                    pcReady.resolve();
                } break;
                case 'closed': {
                    !callbacks || !callbacks.connected || callbacks.onConnectionClosed();
                } break;
            }
        };
        pc.onicecandidate = function(e) {
            !e || !e.candidate || !callbacks || !callbacks.onICe || callbacks.onICe(e.candidate);
        };
    };

    webRtcConnection.prototype = {
        getOffer: function(key) {
            this.channels.isInitiator = true;
            var pc = this.pc;
            var res = $.Deferred();
            this.channels._addChannel(pc.createDataChannel(''));
            pc.createOffer().then(function(offer) {
                pc.setLocalDescription(offer);
                res.resolve(offer);
            }, function() {
                console.error('WebRtc: offer creation fail');
            });
            return res.promise();
        },
        getAnswer: function(offer) {
            this.channels.isInitiator = false;
            var pc = this.pc;
            var res = $.Deferred();
            this.channels._addChannel(pc.createDataChannel(''));
            pc.setRemoteDescription(new RTCSessionDescription(offer));
            pc.createAnswer(function(answer) {
                pc.setLocalDescription(answer);
                res.resolve(answer);
            }, function() {
                console.error('WebRtc: answer creation fail')
            });
            return res.promise();
        },
        setAnswer: function(offer) {
            this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        },
        addICe: function(iceClient) {
            !iceClient || this.pc.addIceCandidate(new RTCIceCandidate(iceClient));
        },
        _free: function() {
            this.pc.oniceconnectionstatechange = null;
            this.pc.onicecandidate = null;
            this.channels._free();
            delete this.channels;
            delete this.pc;
        },
        close: function() {
            this.pc.close();
            this._free();
        },
        isOpened: function() {
            return this.pc.iceConnectionState === 'completed';
        },
        sendMessage: function(label, message) {
            var that = this;
            this.pcReady.then(function() {
                that.channels.getChannel(that.pc, label).then(function(channel) {
                    channel.send(JSON.stringify(message));
                });
            });
        }
    };

    var webRtcMaster = window.webRtcMaster = function() {
        var that = this;
        var connections = this.connections = {};
        var signalChannel = new window.webRtcSignalChannel();
        signalChannel.init({
            onOffer: function(key, offer) {
                var answerSended = false;
                var relatedIce = null;
                var connection = that._getConnection(key, signalChannel);
                connection.getAnswer(offer).then(function(answer) {
                    that._getRelated(key).onOffer.resolve(answer);
                    //signalChannel.sendOffer(answer, that.relatedIce[key]);
                });
                that._getRelated(key).onBoth.then(function(offer, ice) {
                    signalChannel.sendOffer(offer, ice);
                });
            },
            onICe: function(key, iceClient){
                that._getConnection(key, signalChannel).addICe(iceClient);
            }
        });
        this.subscribers = [];
        this.key = signalChannel.roomId;
        this.related = {};
    };

    webRtcMaster.prototype = {
        _getRelated: function(key) {
            var related = this.related[key];
            if (!related) {
                related = this.related[key] = {
                    onIce: $.Deferred(),
                    onOffer: $.Deferred()
                };
                related.onBoth = $.when(related.onOffer, related.onIce);
            }
            return related;
        },
        _getConnection: function(key) {
            var that = this,
                connection = this.connections[key];
            if (!connection) {
                connection = this.connections[key] = new webRtcConnection({
                    onMessage: function (lable, data) {
                        that._onMessage(key, lable, data);
                    },
                    onOpen: function (lable) {
                        that._onOpen(key, lable);
                    },
                    onClose: function (lable) {
                        that._onClose(key, lable);
                    },
                    onConnectionReady: function () {
                        //that._onConnected(key);
                    },
                    onConnectionClosed: function () {
                        connection._free();
                        delete that.connections[key];
                    },
                    onICe: function (ice) {
                        var related = that._getRelated(key);
                        if (related)
                            related.onIce.resolve(ice);
                        else
                            that.sendMessage('', key, ice);
                    }
                });
            }
            return connection;
        },
        subscribe: function (topic, user, onMessage, onUserAdd, onUserLost) {
            var res = {
                key: user,
                lable: topic,
                onMessage: onMessage,
                onOpen: onUserAdd,
                onClose: onUserLost
            };
            this.subscribers.push(res);
            return res;
        },
        unSubscribe: function (res) {
            var pos = this.subscribers.indexOf(res);
            if (pos < 0)
                return;
            this.subscribers.splice(pos, 1);
        },
        sendMessage: function (topic, user, message) {
            var connection = this.connections[user];
            !connection || connection.sendMessage(topic, message);
        },
        sendBroadcastMessage: function (topic, message) {
            var res = [];
            for (var key in this.connections) {
                if (!this.connections.hasOwnProperty(key))
                    continue;
                res.push(connection.sendMessage(topic, message));
            }
        },
        _eachSubscriber: function(key, lable, callback) {
            for (var i = 0; i < this.subscribers.length; i++) {
                var s = this.subscribers[i];
                if (((key === s.key) || !s.key) && ((lable === s.lable) || !s.lable))
                    callback(s, i);
            }
        },
        _onMessage: function(key, lable, data) {
            if (lable === '') {
                var connection = this.connections[key];
                if (connection)
                    connection.addICe(data.message);
                return;
            }
            this._eachSubscriber(key, lable, function(subscriber) {
                if (subscriber.onMessage)
                    subscriber.onMessage(lable, key, data);
            });
        },
        _onOpen: function(key, lable) {
            this._eachSubscriber(key, lable, function(subscriber) {
                if (subscriber.onOpen)
                    subscriber.onOpen(lable, key);
            });
        },
        _onClose: function(key, lable) {
            this._eachSubscriber(key, lable, function(subscriber) {
                if (subscriber.onClose)
                    subscriber.onClose(lable, key);
            });
        }
    };

    var webRtcSlave = window.webRtcSlave = function(code) {
        var that = this,
            connection,
            signalChannel = new window.webRtcSignalChannel(code);
        signalChannel.init({
            onOffer: function(key, offer) {
                if (code !== key)
                    return;
                connection.setAnswer(offer);
            },
            onICe: function(key, iceClient){
                if (code !== key)
                    return;
                connection.addICe(iceClient);
            }
        });

        var onOffer = $.Deferred(),
            onIce = $.Deferred();
        connection = this.connection = new webRtcConnection({
            onMessage: function(lable, data) {
                that._onMessage(lable, data);
            },
            onOpen: function(lable) {
                that._onOpen(lable);
            },
            onClose: function(lable) {
                that._onClose(lable);
            },
            onConnectionReady: function() {
                //that._onConnected();
            },
            onConnectionClosed: function() {
                connection._free();
            },
            onICe: function(ice) {
                if (onIce)
                    onIce.resolve(ice);
                else
                    that.sendMessage('', ice);
            }
        });
        connection.getOffer(code).then(function(answer) {
            onOffer.resolve(answer);
        });
        $.when(onOffer, onIce).then(function(offer, ice) {
            onIce = null;
            signalChannel.sendOffer(offer, ice);
        });
        this.subscribers = [];
    };

    webRtcSlave.prototype = {
        subscribe: function (topic, onMessage, onUserAdd, onUserLost) {
            var res = {
                lable: topic,
                onMessage: onMessage,
                onOpen: onUserAdd,
                onClose: onUserLost
            };
            this.subscribers.push(res);
            return res;
        },
        unSubscribe: function (res) {
            var pos = this.subscribers.indexOf(res);
            if (pos < 0)
                return;
            this.subscribers.splice(pos, 1);
        },
        sendMessage: function (topic, message) {
            return !this.connection || this.connection.sendMessage(topic, message);
        },
        _eachSubscriber: function(lable, callback) {
            for (var i = 0; i < this.subscribers.length; i++) {
                var s = this.subscribers[i];
                if ((lable === s.lable) || (s.lable === null))
                    callback(s, i);
            }
        },
        _onMessage: function(lable, data) {
            if (lable === '') {
                if (this.connection)
                    this.connection.addICe(data.message);
                return;
            }
            this._eachSubscriber(lable, function(subscriber) {
                if (subscriber.onMessage)
                    subscriber.onMessage(lable, data);
            });
        },
        _onOpen: function(lable) {
            this._eachSubscriber(lable, function(subscriber) {
                if (subscriber.onOpen)
                    subscriber.onOpen(lable);
            });
        },
        _onClose: function(lable) {
            this._eachSubscriber(lable, function(subscriber) {
                if (subscriber.onClose)
                    subscriber.onClose(lable);
            });
        }
    };

    //function setUpWebRtc(signalChannel, pc, isInitiator) {
    //    signalChannel.init({
    //        onOffer: function(key, offer) {
    //            if (!isInitiator) {
    //                pc.setRemoteDescription(new RTCSessionDescription(offer));
    //                pc.createAnswer(function(answer) {
    //                    pc.setLocalDescription(answer);
    //                    signalChannel.sendOffer(answer);
    //                }, function() { console.error('WebRtc: answer creation fail') });
    //            } else {
    //                pc.setRemoteDescription(new RTCSessionDescription(offer));
    //            }
    //        },
    //        onICe: function(key, iceClient){
    //            pc.addIceCandidate(new RTCIceCandidate(iceClient));
    //        }
    //    });
    //
    //    pc.onicecandidate = function(e) {
    //        !e || !e.candidate || signalChannel.sendIceClient(e.candidate);
    //    };
    //
    //    if (isInitiator) {
    //        pc.createOffer().then(function(offer) {
    //            pc.setLocalDescription(offer);
    //            signalChannel.sendOffer(offer);
    //        }, function() {
    //            console.error('WebRtc: offer creation fail');
    //        });
    //    }
    //}

    //var webRtcConnection = window.webRtcConnection = function(key, onState) {
    //    var that = this;
    //    that.connections = {};
    //    that.onState = onState;
    //    that._subscribers = [];
    //
    //    that.webRtcSignalChannel = new window.webRtcSignalChannel({
    //        onOffer: function(key, offer) {
    //            var connection = that._getConnection(key);
    //            if (!connection.pc)
    //                that._createAnswer(key, offer);
    //            else
    //                that._applyAnswer(key, offer);
    //        },
    //        onICe: function(key, iceClient){
    //            that._setIceClient(key, iceClient);
    //        }
    //    });
    //    that.webRtcSignalChannel.init(key, initCallback);
    //    if (key) { //need to perform connection
    //        that.isMaster = true;
    //        that._createOffer(key);
    //    }
    //};
    //
    //webRtcConnection.prototype = {
    //    _getConnection: function(key) {
    //        var that = this;
    //        var connection = that.connections[key];
    //        if (!connection) {
    //            connection = that.connections[key] = {
    //                channels: {},
    //                messageQueue: null,
    //                pcOfferPromise: $.Deferred()
    //            };
    //            var pc = connection.pc = new RTCPeerConnection();
    //            pc.onicecandidate = function(e) {
    //                !e || !e.candidate || that.webRtcSignalChannel.sendIceClient(e.candidate);
    //            };
    //            if (that.isMaster)
    //                that._getChannel(key, 'main');
    //            pc.ondatachannel = function(event) {
    //                var channel = event.channel;
    //                if (connection.channels[channel.label]) {
    //                    if (!that.isMaster)
    //                        that._closeChannel(key, channel.label);
    //                }
    //                connection.channels[channel.label] = channel;
    //                that._subscribeChannel(key, channel);
    //            };
    //        }
    //        return connection;
    //    },
    //    _subscribeChannel: function(key, channel) {
    //        var that = this;
    //        channel.onmessage = function(event) {
    //            that._onMessage(key, channel.label, event);
    //        };
    //        channel.onopen = function(event){
    //            that._onState(key, channel.label, 'open', event);
    //        };
    //        channel.onclose = function(event){
    //            that._onState(key, channel.label, 'close', event);
    //        };
    //    },
    //    _unSubscribeChannel: function(channel) {
    //        var that = this;
    //        channel.onmessage = null;
    //        channel.onopen = null;
    //        channel.onclose = null;
    //    },
    //    _createOffer: function(key) {
    //        var that = this;
    //        var pc = that._getConnection(key).pc;
    //        pc.createOffer().then(function(offer) {
    //            pc.setLocalDescription(offer);
    //            that.webRtcSignalChannel.sendOffer(offer);
    //        }, function() {
    //            that.error('WebRtc: offer creation fail');
    //        });
    //    },
    //    _createAnswer: function(key, offer) {
    //        var that = this;
    //        var pc = that._getConnection(key).pc;
    //        pc.setRemoteDescription(new RTCSessionDescription(offer));
    //        pc.createAnswer(function(answer) {
    //            pc.setLocalDescription(answer);
    //            that.webRtcSignalChannel.sendOffer(answer);
    //        }, function() { that.error('WebRtc: answer creation fail') });
    //    },
    //    _applyAnswer: function(key, answer) {
    //        var that = this;
    //        var connection = that._getConnection(key);
    //        connection.pc.setRemoteDescription(new RTCSessionDescription(answer));
    //        connection.pcOfferPromise.resolve();
    //    },
    //    _setIceClient: function(key, iceClient) {
    //        var that = this;
    //        var connection = that._getConnection(key);
    //        connection.pcOfferPromise.then(function() {
    //            connection.pc.addIceCandidate(new RTCIceCandidate(iceClient));
    //        });
    //    },
    //    _eachSubscriber: function(key, channelLabel, callback) {
    //        this._subscribers.forEach(function(el) {
    //            if (el.key !== null && el.key !== key)
    //                return;
    //            if (el.channelLabel !== null && el.channelLabel !== channelLabel)
    //                return;
    //            callback(el);
    //        });
    //    },
    //    _onMessage: function(key, channelLabel, event) {
    //        var that = this;
    //        if (!event || !event.data)
    //            return;
    //        var data = JSON.parse(event.data);
    //        that._eachSubscriber(function(el) {
    //            if (el.callback)
    //                el.callback(key, channelLabel, data);
    //        });
    //    },
    //    _onState: function(key, channelLabel, eventDesc, event) {
    //        var that = this;
    //        if (eventDesc === 'open') {
    //            var connection = that._getConnection(key);
    //            var messageQueue = connection.messageQueue[channelLabel];
    //            connection.messageQueue[channelLabel] = null;
    //            if (messageQueue)
    //                messageQueue.forEach(function(el) {
    //                    that.sendMessage(key, channelLabel, el.message)
    //                });
    //        }
    //        if (typeof that.onState !== 'function')
    //            return;
    //        that.onState(key, channelLabel, eventDesc);
    //        that._eachSubscriber(function(el) {
    //            if (el.stateCallback)
    //                el.stateCallback(key, channelLabel, eventDesc);
    //        });
    //    },
    //    _getChannel: function(key, channelLabel) {
    //        var that = this;
    //        var connection = that._getConnection(key);
    //        var channel = connection.channels[channelLabel];
    //        if (!channel) {
    //            channel = connection.channels[channelLabel] = connection.pc.createDataChannel(channelLabel);
    //            that._subscribeChannel(key, channel)
    //        }
    //        return channel;
    //    },
    //    _closeChannel: function(key, channelLabel) {
    //        var that = this;
    //        var connection = that.connections[key];
    //        if (!connection)
    //            return;
    //        var channel = connection.channels[channelLabel];
    //        if (!channel)
    //            return;
    //        channel.close();
    //        that._unSubscribeChannel(key, channel);
    //        delete connection.channels[channelLabel];
    //    },
    //    subscribe: function(key, channelLabel, callback, stateCallback) {
    //        this._getChannel(key, channelLabel);
    //        if (typeof callback !== 'function')
    //            return;
    //        var res = {
    //            key: key,
    //            channelLabel: channelLabel,
    //            callback: callback,
    //            stateCallback: stateCallback
    //        };
    //        this._subscribers.push(res);
    //    },
    //    unSubscribe: function(subscriber) {
    //        var pos = this._subscribers.indexOf(subscriber);
    //        if (pos < 0)
    //            return;
    //        this._subscribers.splice(pos, 1);
    //    },
    //    sendMessage: function(key, channelLabel, message) {
    //        var that = this;
    //        var selectedChannelLabel = channelLabel || 'main';
    //        var channel = that._getChannel(key, selectedChannelLabel);
    //        if (channel.readyState === 'open')
    //            channel.send(JSON.stringify(message));
    //        else{
    //            var connection = that._getConnection(key);
    //            var messageQueue = connection.messageQueue[selectedChannelLabel];
    //            if (!messageQueue)
    //                messageQueue = connection.messageQueue[selectedChannelLabel] = [];
    //            messageQueue.push({
    //                message: message
    //            });
    //        }
    //    },
    //    sendBrodcastMessage: function(channelLabel, message) {
    //        var that = this;
    //        for (var key in that.connections) {
    //            if (!that.connections.hasOwnProperty(key))
    //                continue;
    //            that.sendMessage(key, channelLabel, message);
    //        }
    //    },
    //    error: function(text) {
    //        console.warn(text);
    //    }
    //};


})();