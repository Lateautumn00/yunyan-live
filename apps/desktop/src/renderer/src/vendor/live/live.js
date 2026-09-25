/*
	The MIT License (MIT)

	Copyright (c) 2016 Meetecho

	Permission is hereby granted, free of charge, to any person obtaining
	a copy of this software and associated documentation files (the "Software"),
	to deal in the Software without restriction, including without limitation
	the rights to use, copy, modify, merge, publish, distribute, sublicense,
	and/or sell copies of the Software, and to permit persons to whom the
	Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included
	in all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
	THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
	OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
	ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
	OTHER DEALINGS IN THE SOFTWARE.
 */
// List of sessions
// yunyan-live patch: desktopCapturer moved to main process (Electron >= 14).
const desktopCapturer = {
  getSources: opts =>
    window.electronAPI && window.electronAPI.getSources
      ? window.electronAPI.getSources()
      : Promise.reject(new Error('electronAPI.getSources unavailable'))
};
Live.sessions = {};

Live.isExtensionEnabled = function() {
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    // No need for the extension, getDisplayMedia is supported
    return true;
  }
  if (window.navigator.userAgent.match('Chrome')) {
    var chromever = parseInt(
      window.navigator.userAgent.match(/Chrome\/(.*) /)[1],
      10
    );
    var maxver = 33;
    if (window.navigator.userAgent.match('Linux')) maxver = 35; // "known" crash in chrome 34 and 35 on linux
    if (chromever >= 26 && chromever <= maxver) {
      // Older versions of Chrome don't support this extension-based approach, so lie
      return true;
    }
    return Live.extension.isInstalled();
  } else {
    // Firefox of others, no need for the extension (but this doesn't mean it will work)
    return true;
  }
};

var defaultExtension = {
  // Screensharing Chrome Extension ID
  extensionId: 'hapfgfdkleiggjjpfpenajgdnfckjpaj',
  isInstalled: function() {
    return document.querySelector('#janus-extension-installed') !== null;
  },
  getScreen: function(callback) {
    var pending = window.setTimeout(function() {
      var error = new Error('NavigatorUserMediaError');
      error.name =
        'The required Chrome extension is not installed: click <a href="#">here</a> to install it. (NOTE: this will need you to refresh the page)';
      return callback(error);
    }, 1000);
    this.cache[pending] = callback;
    window.postMessage(
      {
        type: 'janusGetScreen',
        id: pending
      },
      '*'
    );
  },
  init: function() {
    var cache = {};
    this.cache = cache;
    // Wait for events from the Chrome Extension
    window.addEventListener('message', function(event) {
      if (event.origin != window.location.origin) return;
      if (event.data.type == 'janusGotScreen' && cache[event.data.id]) {
        var callback = cache[event.data.id];
        delete cache[event.data.id];

        if (event.data.sourceId === '') {
          // user canceled
          var error = new Error('NavigatorUserMediaError');
          error.name = 'You cancelled the request for permission, giving up...';
          callback(error);
        } else {
          callback(null, event.data.sourceId);
        }
      } else if (event.data.type == 'janusGetScreenPending') {
        console.log('clearing ', event.data.id);
        window.clearTimeout(event.data.id);
      }
    });
  }
};

Live.useDefaultDependencies = function(deps) {
  var f = (deps && deps.fetch) || fetch;
  var p = (deps && deps.Promise) || Promise;
  var socketCls = (deps && deps.WebSocket) || WebSocket;

  return {
    newWebSocket: function(server, proto) {
      return new socketCls(server, proto);
    },
    extension: (deps && deps.extension) || defaultExtension,
    isArray: function(arr) {
      return Array.isArray(arr);
    },
    webRTCAdapter: (deps && deps.adapter) || adapter,
    httpAPICall: function(url, options) {
      var fetchOptions = {
        method: options.verb,
        headers: {
          Accept: 'application/json, text/plain, */*'
        },
        cache: 'no-cache'
      };
      if (options.verb === 'POST') {
        fetchOptions.headers['Content-Type'] = 'application/json';
      }
      if (options.withCredentials !== undefined) {
        fetchOptions.credentials =
          options.withCredentials === true
            ? 'include'
            : options.withCredentials
            ? options.withCredentials
            : 'omit';
      }
      if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      var fetching = f(url, fetchOptions).catch(function(error) {
        return p.reject({
          message: 'Probably a network error, is the server down?',
          error: error
        });
      });

      /*
       * fetch() does not natively support timeouts.
       * Work around this by starting a timeout manually, and racing it agains the fetch() to see which thing resolves first.
       */

      if (options.timeout) {
        var timeout = new p(function(resolve, reject) {
          var timerId = setTimeout(function() {
            clearTimeout(timerId);
            return reject({
              message: 'Request timed out',
              timeout: options.timeout
            });
          }, options.timeout);
        });
        fetching = p.race([fetching, timeout]);
      }

      fetching
        .then(function(response) {
          if (response.ok) {
            if (typeof options.success === typeof Live.noop) {
              return response
                .json()
                .then(function(parsed) {
                  options.success(parsed);
                })
                .catch(function(error) {
                  return p.reject({
                    message: 'Failed to parse response body',
                    error: error,
                    response: response
                  });
                });
            }
          } else {
            return p.reject({
              message: 'API call failed',
              response: response
            });
          }
        })
        .catch(function(error) {
          if (typeof options.error === typeof Live.noop) {
            options.error(error.message || '<< internal error >>', error);
          }
        });

      return fetching;
    }
  };
};

Live.useOldDependencies = function(deps) {
  var jq = (deps && deps.jQuery) || jQuery;
  var socketCls = (deps && deps.WebSocket) || WebSocket;
  return {
    newWebSocket: function(server, proto) {
      return new socketCls(server, proto);
    },
    isArray: function(arr) {
      return jq.isArray(arr);
    },
    extension: (deps && deps.extension) || defaultExtension,
    webRTCAdapter: (deps && deps.adapter) || adapter,
    httpAPICall: function(url, options) {
      var payload =
        options.body !== undefined
          ? {
              contentType: 'application/json',
              data: JSON.stringify(options.body)
            }
          : {};
      var credentials =
        options.withCredentials !== undefined
          ? {
              xhrFields: {
                withCredentials: options.withCredentials
              }
            }
          : {};

      return jq.ajax(
        jq.extend(payload, credentials, {
          url: url,
          type: options.verb,
          cache: false,
          dataType: 'json',
          async: options.async,
          timeout: options.timeout,
          success: function(result) {
            if (typeof options.success === typeof Live.noop) {
              options.success(result);
            }
          },
          error: function(xhr, status, err) {
            if (typeof options.error === typeof Live.noop) {
              options.error(status, err);
            }
          }
        })
      );
    }
  };
};

Live.noop = function() {};

Live.dataChanDefaultLabel = 'LiveDataChannel';

// Note: in the future we may want to change this, e.g., as was
// attempted in https://github.com/meetecho/janus-gateway/issues/1670
Live.endOfCandidates = null;

// Initialization
Live.init = function(options) {
  options = options || {};
  options.callback =
    typeof options.callback == 'function' ? options.callback : Live.noop;
  if (Live.initDone) {
    // Already initialized
    options.callback();
  } else {
    if (typeof console == 'undefined' || typeof console.log == 'undefined') {
      console = {
        log: function() {}
      };
    }
    // Console logging (all debugging disabled by default)
    Live.trace = Live.noop;
    Live.debug = Live.noop;
    Live.vdebug = Live.noop;
    Live.log = Live.noop;
    Live.warn = Live.noop;
    Live.error = Live.noop;
    if (options.debug === true || options.debug === 'all') {
      // Enable all debugging levels
      Live.trace = console.trace.bind(console);
      Live.debug = console.debug.bind(console);
      Live.vdebug = console.debug.bind(console);
      Live.log = console.log.bind(console);
      Live.warn = console.warn.bind(console);
      Live.error = console.error.bind(console);
    } else if (Array.isArray(options.debug)) {
      for (var d of options.debug) {
        switch (d) {
          case 'trace':
            Live.trace = console.trace.bind(console);
            break;
          case 'debug':
            Live.debug = console.debug.bind(console);
            break;
          case 'vdebug':
            Live.vdebug = console.debug.bind(console);
            break;
          case 'log':
            Live.log = console.log.bind(console);
            break;
          case 'warn':
            Live.warn = console.warn.bind(console);
            break;
          case 'error':
            Live.error = console.error.bind(console);
            break;
          default:
            console.error(
              "Unknown debugging option '" +
                d +
                "' (supported: 'trace', 'debug', 'vdebug', 'log', warn', 'error')"
            );
            break;
        }
      }
    }
    Live.log('Initializing library');

    var usedDependencies =
      options.dependencies || Live.useDefaultDependencies();
    Live.isArray = usedDependencies.isArray;
    Live.webRTCAdapter = usedDependencies.webRTCAdapter;
    Live.httpAPICall = usedDependencies.httpAPICall;
    Live.newWebSocket = usedDependencies.newWebSocket;
    Live.extension = usedDependencies.extension;
    Live.extension.init();

    // Helper method to enumerate devices
    Live.listDevices = function(callback, config) {
      callback = typeof callback == 'function' ? callback : Live.noop;
      if (config == null)
        config = {
          audio: true,
          video: true
        };
      if (Live.isGetUserMediaAvailable()) {
        navigator.mediaDevices
          .getUserMedia(config)
          .then(function(stream) {
            navigator.mediaDevices.enumerateDevices().then(function(devices) {
              Live.debug(devices);
              callback(devices);
              // Get rid of the now useless stream
              try {
                var tracks = stream.getTracks();
                for (var mst of tracks) {
                  if (mst) mst.stop();
                }
              } catch (e) {}
            });
          })
          .catch(function(err) {
            Live.error(err);
            callback([]);
          });
      } else {
        Live.warn('navigator.mediaDevices unavailable');
        callback([]);
      }
    };
    // Helper methods to attach/reattach a stream to a video element (previously part of adapter.js)
    Live.attachMediaStream = function(element, stream) {
      try {
        element.srcObject = stream;
      } catch (e) {
        try {
          element.src = URL.createObjectURL(stream);
        } catch (e) {
          Live.error('Error attaching stream to element');
        }
      }
    };
    Live.reattachMediaStream = function(to, from) {
      try {
        to.srcObject = from.srcObject;
      } catch (e) {
        try {
          to.src = from.src;
        } catch (e) {
          Live.error('Error reattaching stream to element');
        }
      }
    };
    // Detect tab close: make sure we don't loose existing onbeforeunload handlers
    // (note: for iOS we need to subscribe to a different event, 'pagehide', see
    // https://gist.github.com/thehunmonkgroup/6bee8941a49b86be31a787fe8f4b8cfe)
    var iOS = ['iPad', 'iPhone', 'iPod'].indexOf(navigator.platform) >= 0;
    var eventName = iOS ? 'pagehide' : 'beforeunload';
    var oldOBF = window['on' + eventName];
    window.addEventListener(eventName, function(event) {
      Live.log('Closing window');
      for (var s in Live.sessions) {
        if (Live.sessions[s] && Live.sessions[s].destroyOnUnload) {
          Live.log('Destroying session ' + s);
          Live.sessions[s].destroy({
            unload: true,
            notifyDestroyed: false
          });
        }
      }
      if (oldOBF && typeof oldOBF == 'function') {
        oldOBF();
      }
    });
    // If this is a Safari Technology Preview, check if VP8 is supported
    Live.safariVp8 = false;
    if (
      Live.webRTCAdapter.browserDetails.browser === 'safari' &&
      Live.webRTCAdapter.browserDetails.version >= 605
    ) {
      // Let's see if RTCRtpSender.getCapabilities() is there
      if (
        RTCRtpSender &&
        RTCRtpSender.getCapabilities &&
        RTCRtpSender.getCapabilities('video') &&
        RTCRtpSender.getCapabilities('video').codecs &&
        RTCRtpSender.getCapabilities('video').codecs.length
      ) {
        for (var codec of RTCRtpSender.getCapabilities('video').codecs) {
          if (
            codec &&
            codec.mimeType &&
            codec.mimeType.toLowerCase() === 'video/vp8'
          ) {
            Live.safariVp8 = true;
            break;
          }
        }
        if (Live.safariVp8) {
          Live.log('This version of Safari supports VP8');
        } else {
          Live.warn(
            "This version of Safari does NOT support VP8: if you're using a Technology Preview, " +
              "try enabling the 'WebRTC VP8 codec' setting in the 'Experimental Features' Develop menu"
          );
        }
      } else {
        // We do it in a very ugly way, as there's no alternative...
        // We create a PeerConnection to see if VP8 is in an offer
        var testpc = new RTCPeerConnection({});
        testpc
          .createOffer({
            offerToReceiveVideo: true
          })
          .then(function(offer) {
            Live.safariVp8 = offer.sdp.indexOf('VP8') !== -1;
            if (Live.safariVp8) {
              Live.log('This version of Safari supports VP8');
            } else {
              Live.warn(
                "This version of Safari does NOT support VP8: if you're using a Technology Preview, " +
                  "try enabling the 'WebRTC VP8 codec' setting in the 'Experimental Features' Develop menu"
              );
            }
            testpc.close();
            testpc = null;
          });
      }
    }
    // Check if this browser supports Unified Plan and transceivers
    // Based on https://codepen.io/anon/pen/ZqLwWV?editors=0010
    Live.unifiedPlan = false;
    if (
      Live.webRTCAdapter.browserDetails.browser === 'firefox' &&
      Live.webRTCAdapter.browserDetails.version >= 59
    ) {
      // Firefox definitely does, starting from version 59
      Live.unifiedPlan = true;
    } else if (
      Live.webRTCAdapter.browserDetails.browser === 'chrome' &&
      Live.webRTCAdapter.browserDetails.version < 72
    ) {
      // Chrome does, but it's only usable from version 72 on
      Live.unifiedPlan = false;
    } else if (
      !window.RTCRtpTransceiver ||
      !('currentDirection' in RTCRtpTransceiver.prototype)
    ) {
      // Safari supports addTransceiver() but not Unified Plan when
      // currentDirection is not defined (see codepen above).
      Live.unifiedPlan = false;
    } else {
      // Check if addTransceiver() throws an exception
      var tempPc = new RTCPeerConnection();
      try {
        tempPc.addTransceiver('audio');
        Live.unifiedPlan = true;
      } catch (e) {}
      tempPc.close();
    }
    Live.initDone = true;
    options.callback();
  }
};

// Helper method to check whether WebRTC is supported by this browser
Live.isWebrtcSupported = function() {
  return !!window.RTCPeerConnection;
};
// Helper method to check whether devices can be accessed by this browser (e.g., not possible via plain HTTP)
Live.isGetUserMediaAvailable = function() {
  return navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
};

// Helper method to create random identifiers (e.g., transaction)
Live.randomString = function(len) {
  var charSet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var randomString = '';
  for (var i = 0; i < len; i++) {
    var randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
};

function Live(gatewayCallbacks) {
  gatewayCallbacks = gatewayCallbacks || {};
  gatewayCallbacks.success =
    typeof gatewayCallbacks.success == 'function'
      ? gatewayCallbacks.success
      : Live.noop;
  gatewayCallbacks.error =
    typeof gatewayCallbacks.error == 'function'
      ? gatewayCallbacks.error
      : Live.noop;
  gatewayCallbacks.destroyed =
    typeof gatewayCallbacks.destroyed == 'function'
      ? gatewayCallbacks.destroyed
      : Live.noop;
  if (!Live.initDone) {
    gatewayCallbacks.error('Library not initialized');
    return {};
  }
  if (!Live.isWebrtcSupported()) {
    gatewayCallbacks.error('WebRTC not supported by this browser');
    return {};
  }
  Live.log('Library initialized: ' + Live.initDone);
  if (!gatewayCallbacks.server) {
    gatewayCallbacks.error('Invalid server url');
    return {};
  }
  var websockets = false;
  var ws = null;
  var wsHandlers = {};
  var wsKeepaliveTimeoutId = null;
  var servers = null;
  var serversIndex = 0;
  var server = gatewayCallbacks.server;
  if (Live.isArray(server)) {
    Live.log(
      'Multiple servers provided (' +
        server.length +
        '), will use the first that works'
    );
    server = null;
    servers = gatewayCallbacks.server;
    Live.debug(servers);
  } else {
    if (server.indexOf('ws') === 0) {
      websockets = true;
      Live.log('Using WebSockets to contact Live: ' + server);
    } else {
      websockets = false;
      Live.log('Using REST API to contact Live: ' + server);
    }
  }
  var iceServers = [];
  iceServers = gatewayCallbacks.iceServers || [
    {
      urls: 'stun:stun.l.google.com:19302' //本地及服务器测试
    }
  ];

  var iceTransportPolicy = gatewayCallbacks.iceTransportPolicy;
  var bundlePolicy = gatewayCallbacks.bundlePolicy;
  // Whether IPv6 candidates should be gathered
  var ipv6Support = gatewayCallbacks.ipv6 === true;
  // Whether we should enable the withCredentials flag for XHR requests
  var withCredentials = false;
  if (
    gatewayCallbacks.withCredentials !== undefined &&
    gatewayCallbacks.withCredentials !== null
  )
    withCredentials = gatewayCallbacks.withCredentials === true;
  // Optional max events
  var maxev = 10;
  if (
    gatewayCallbacks.max_poll_events !== undefined &&
    gatewayCallbacks.max_poll_events !== null
  )
    maxev = gatewayCallbacks.max_poll_events;
  if (maxev < 1) maxev = 1;
  // Token to use (only if the token based authentication mechanism is enabled)
  var token = null;
  if (gatewayCallbacks.token !== undefined && gatewayCallbacks.token !== null)
    token = gatewayCallbacks.token;
  // API secret to use (only if the shared API secret is enabled)
  var apisecret = null;
  if (
    gatewayCallbacks.apisecret !== undefined &&
    gatewayCallbacks.apisecret !== null
  )
    apisecret = gatewayCallbacks.apisecret;
  // Whether we should destroy this session when onbeforeunload is called
  this.destroyOnUnload = true;
  if (
    gatewayCallbacks.destroyOnUnload !== undefined &&
    gatewayCallbacks.destroyOnUnload !== null
  )
    this.destroyOnUnload = gatewayCallbacks.destroyOnUnload === true;
  // Some timeout-related values
  var keepAlivePeriod = 25000;
  if (
    gatewayCallbacks.keepAlivePeriod !== undefined &&
    gatewayCallbacks.keepAlivePeriod !== null
  )
    keepAlivePeriod = gatewayCallbacks.keepAlivePeriod;
  if (isNaN(keepAlivePeriod)) keepAlivePeriod = 25000;
  var longPollTimeout = 60000;
  if (
    gatewayCallbacks.longPollTimeout !== undefined &&
    gatewayCallbacks.longPollTimeout !== null
  )
    longPollTimeout = gatewayCallbacks.longPollTimeout;
  if (isNaN(longPollTimeout)) longPollTimeout = 60000;

  // overrides for default maxBitrate values for simulcasting
  function getMaxBitrates(simulcastMaxBitrates) {
    var maxBitrates = {
      high: 900000,
      medium: 300000,
      low: 100000
    };

    if (simulcastMaxBitrates !== undefined && simulcastMaxBitrates !== null) {
      if (simulcastMaxBitrates.high)
        maxBitrates.high = simulcastMaxBitrates.high;
      if (simulcastMaxBitrates.medium)
        maxBitrates.medium = simulcastMaxBitrates.medium;
      if (simulcastMaxBitrates.low) maxBitrates.low = simulcastMaxBitrates.low;
    }

    return maxBitrates;
  }

  var connected = false;
  var sessionId = null;
  var pluginHandles = {};
  var that = this;
  var retries = 0;
  var transactions = {};
  createSession(gatewayCallbacks);

  // Public methods
  this.getServer = function() {
    return server;
  };
  this.isConnected = function() {
    return connected;
  };
  this.reconnect = function(callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    callbacks['reconnect'] = true;
    createSession(callbacks);
  };
  this.getSessionId = function() {
    return sessionId;
  };
  this.destroy = function(callbacks) {
    destroySession(callbacks);
  };
  this.attach = function(callbacks) {
    createHandle(callbacks);
  };

  function eventHandler() {
    if (sessionId == null) return;
    Live.debug('Long poll...');
    if (!connected) {
      Live.warn('Is the server down? (connected=false)');
      return;
    }
    var longpoll = server + '/' + sessionId + '?rid=' + new Date().getTime();
    if (maxev) longpoll = longpoll + '&maxev=' + maxev;
    if (token) longpoll = longpoll + '&token=' + encodeURIComponent(token);
    if (apisecret)
      longpoll = longpoll + '&apisecret=' + encodeURIComponent(apisecret);
    Live.httpAPICall(longpoll, {
      verb: 'GET',
      withCredentials: withCredentials,
      success: handleEvent,
      timeout: longPollTimeout,
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown);
        retries++;
        if (retries > 3) {
          // Did we just lose the server? :-(
          connected = false;
          gatewayCallbacks.error('Lost connection to the server (is it down?)');
          return;
        }
        eventHandler();
      }
    });
  }

  // Private event handler: this will trigger plugin callbacks, if set
  function handleEvent(json, skipTimeout) {
    retries = 0;
    if (
      !websockets &&
      sessionId !== undefined &&
      sessionId !== null &&
      skipTimeout !== true
    )
      eventHandler();
    if (!websockets && Live.isArray(json)) {
      // We got an array: it means we passed a maxev > 1, iterate on all objects
      for (var i = 0; i < json.length; i++) {
        handleEvent(json[i], true);
      }
      return;
    }
    if (json['janus'] === 'keepalive') {
      // Nothing happened
      Live.vdebug('Got a keepalive on session ' + sessionId);
      return;
    } else if (json['janus'] === 'ack') {
      // Just an ack, we can probably ignore
      Live.debug('Got an ack on session ' + sessionId);
      Live.debug(json);
      var transaction = json['transaction'];
      if (transaction) {
        var reportSuccess = transactions[transaction];
        if (reportSuccess) reportSuccess(json);
        delete transactions[transaction];
      }
      return;
    } else if (json['janus'] === 'success') {
      // Success!
      Live.debug('Got a success on session ' + sessionId);
      Live.debug(json);
      var transaction = json['transaction'];
      if (transaction) {
        var reportSuccess = transactions[transaction];
        if (reportSuccess) reportSuccess(json);
        delete transactions[transaction];
      }
      return;
    } else if (json['janus'] === 'trickle') {
      // We got a trickle candidate from Live
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        Live.debug('This handle is not attached to this session');
        return;
      }
      var candidate = json['candidate'];
      Live.debug('Got a trickled candidate on session ' + sessionId);
      Live.debug(candidate);
      var config = pluginHandle.webrtcStuff;
      if (config.pc && config.remoteSdp) {
        // Add candidate right now
        Live.debug('Adding remote candidate:', candidate);
        if (!candidate || candidate.completed === true) {
          // end-of-candidates
          config.pc.addIceCandidate(Live.endOfCandidates);
        } else {
          // New candidate
          config.pc.addIceCandidate(candidate);
        }
      } else {
        // We didn't do setRemoteDescription (trickle got here before the offer?)
        Live.debug(
          "We didn't do setRemoteDescription (trickle got here before the offer?), caching candidate"
        );
        if (!config.candidates) config.candidates = [];
        config.candidates.push(candidate);
        Live.debug(config.candidates);
      }
    } else if (json['janus'] === 'webrtcup') {
      // The PeerConnection with the server is up! Notify this
      Live.debug('Got a webrtcup event on session ' + sessionId);
      Live.debug(json);
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        Live.debug('This handle is not attached to this session');
        return;
      }
      pluginHandle.webrtcState(true);
      return;
    } else if (json['janus'] === 'hangup') {
      // A plugin asked the core to hangup a PeerConnection on one of our handles
      Live.debug('Got a hangup event on session ' + sessionId);
      Live.debug(json);
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        Live.debug('This handle is not attached to this session');
        return;
      }
      pluginHandle.webrtcState(false, json['reason']);
      pluginHandle.hangup();
    } else if (json['janus'] === 'detached') {
      // A plugin asked the core to detach one of our handles
      Live.debug('Got a detached event on session ' + sessionId);
      Live.debug(json);
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        // Don't warn here because destroyHandle causes this situation.
        return;
      }
      pluginHandle.detached = true;
      pluginHandle.ondetached();
      pluginHandle.detach();
    } else if (json['janus'] === 'media') {
      // Media started/stopped flowing
      Live.debug('Got a media event on session ' + sessionId);
      Live.debug(json);
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        Live.debug('This handle is not attached to this session');
        return;
      }
      pluginHandle.mediaState(json['type'], json['receiving']);
    } else if (json['janus'] === 'slowlink') {
      Live.debug('Got a slowlink event on session ' + sessionId);
      Live.debug(json);
      // Trouble uplink or downlink
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        Live.debug('This handle is not attached to this session');
        return;
      }
      pluginHandle.slowLink(json['uplink'], json['lost']);
    } else if (json['janus'] === 'error') {
      // Oops, something wrong happened
      Live.error('Ooops: ' + json['error'].code + ' ' + json['error'].reason); // FIXME
      Live.debug(json);
      var transaction = json['transaction'];
      if (transaction) {
        var reportSuccess = transactions[transaction];
        if (reportSuccess) {
          reportSuccess(json);
        }
        delete transactions[transaction];
      }
      return;
    } else if (json['janus'] === 'event') {
      Live.debug('Got a plugin event on session ' + sessionId);
      Live.debug(json);
      var sender = json['sender'];
      if (!sender) {
        Live.warn('Missing sender...');
        return;
      }
      var plugindata = json['plugindata'];
      if (!plugindata) {
        Live.warn('Missing plugindata...');
        return;
      }
      Live.debug(
        '  -- Event is coming from ' +
          sender +
          ' (' +
          plugindata['plugin'] +
          ')'
      );
      var data = plugindata['data'];
      Live.debug(data);
      var pluginHandle = pluginHandles[sender];
      if (!pluginHandle) {
        Live.warn('This handle is not attached to this session');
        return;
      }
      var jsep = json['jsep'];
      if (jsep) {
        Live.debug('Handling SDP as well...');
        Live.debug(jsep);
      }
      var callback = pluginHandle.onmessage;
      if (callback) {
        Live.debug('Notifying application...');
        // Send to callback specified when attaching plugin handle
        callback(data, jsep);
      } else {
        // Send to generic callback (?)
        Live.debug('No provided notification callback');
      }
    } else if (json['janus'] === 'timeout') {
      Live.error('Timeout on session ' + sessionId);
      Live.debug(json);
      if (websockets) {
        ws.close(3504, 'Gateway timeout');
      }
      return;
    } else {
      Live.warn(
        "Unknown message/event  '" + json['janus'] + "' on session " + sessionId
      );
      Live.debug(json);
    }
  }

  // Private helper to send keep-alive messages on WebSockets
  function keepAlive() {
    if (!server || !websockets || !connected) return;
    wsKeepaliveTimeoutId = setTimeout(keepAlive, keepAlivePeriod);
    var request = {
      janus: 'keepalive',
      session_id: sessionId,
      transaction: Live.randomString(12)
    };
    if (token) request['token'] = token;
    if (apisecret) request['apisecret'] = apisecret;
    ws.send(JSON.stringify(request));
  }

  // Private method to create a session
  function createSession(callbacks) {
    var transaction = Live.randomString(12);
    var request = {
      janus: 'create',
      transaction: transaction
    };
    if (callbacks['reconnect']) {
      // We're reconnecting, claim the session
      connected = false;
      request['janus'] = 'claim';
      request['session_id'] = sessionId;
      // If we were using websockets, ignore the old connection
      if (ws) {
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        if (wsKeepaliveTimeoutId) {
          clearTimeout(wsKeepaliveTimeoutId);
          wsKeepaliveTimeoutId = null;
        }
      }
    }
    if (token) request['token'] = token;
    if (apisecret) request['apisecret'] = apisecret;
    if (!server && Live.isArray(servers)) {
      // We still need to find a working server from the list we were given
      server = servers[serversIndex];
      if (server.indexOf('ws') === 0) {
        websockets = true;
        Live.log(
          'Server #' +
            (serversIndex + 1) +
            ': trying WebSockets to contact Live (' +
            server +
            ')'
        );
      } else {
        websockets = false;
        Live.log(
          'Server #' +
            (serversIndex + 1) +
            ': trying REST API to contact Live (' +
            server +
            ')'
        );
      }
    }
    if (websockets) {
      ws = Live.newWebSocket(server, 'janus-protocol');
      wsHandlers = {
        error: function() {
          Live.error(
            'Error connecting to the Live WebSockets server... ' + server
          );
          if (Live.isArray(servers) && !callbacks['reconnect']) {
            serversIndex++;
            if (serversIndex === servers.length) {
              // We tried all the servers the user gave us and they all failed
              callbacks.error(
                'Error connecting to any of the provided Live servers: Is the server down?'
              );
              return;
            }
            // Let's try the next server
            server = null;
            setTimeout(function() {
              createSession(callbacks);
            }, 200);
            return;
          }
          callbacks.error(
            'Error connecting to the Live WebSockets server: Is the server down?'
          );
        },

        open: function() {
          // We need to be notified about the success
          transactions[transaction] = function(json) {
            Live.debug(json);
            if (json['janus'] !== 'success') {
              Live.error(
                'Ooops: ' + json['error'].code + ' ' + json['error'].reason
              ); // FIXME
              callbacks.error(json['error'].reason);
              return;
            }
            wsKeepaliveTimeoutId = setTimeout(keepAlive, keepAlivePeriod);
            connected = true;
            sessionId = json['session_id']
              ? json['session_id']
              : json.data['id'];
            if (callbacks['reconnect']) {
              Live.log('Claimed session: ' + sessionId);
            } else {
              Live.log('Created session: ' + sessionId);
            }
            Live.sessions[sessionId] = that;
            callbacks.success();
          };
          ws.send(JSON.stringify(request));
        },

        message: function(event) {
          handleEvent(JSON.parse(event.data));
        },

        close: function() {
          if (!server || !connected) {
            return;
          }
          connected = false;
          // FIXME What if this is called when the page is closed?
          gatewayCallbacks.error('Lost connection to the server (is it down?)');
        }
      };

      for (var eventName in wsHandlers) {
        ws.addEventListener(eventName, wsHandlers[eventName]);
      }

      return;
    }
    Live.httpAPICall(server, {
      verb: 'POST',
      withCredentials: withCredentials,
      body: request,
      success: function(json) {
        Live.debug(json);
        if (json['janus'] !== 'success') {
          Live.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          ); // FIXME
          callbacks.error(json['error'].reason);
          return;
        }
        connected = true;
        sessionId = json['session_id'] ? json['session_id'] : json.data['id'];
        if (callbacks['reconnect']) {
          Live.log('Claimed session: ' + sessionId);
        } else {
          Live.log('Created session: ' + sessionId);
        }
        Live.sessions[sessionId] = that;
        eventHandler();
        callbacks.success();
      },
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown); // FIXME
        if (Live.isArray(servers) && !callbacks['reconnect']) {
          serversIndex++;
          if (serversIndex === servers.length) {
            // We tried all the servers the user gave us and they all failed
            callbacks.error(
              'Error connecting to any of the provided Live servers: Is the server down?'
            );
            return;
          }
          // Let's try the next server
          server = null;
          setTimeout(function() {
            createSession(callbacks);
          }, 200);
          return;
        }
        if (errorThrown === '')
          callbacks.error(textStatus + ': Is the server down?');
        else callbacks.error(textStatus + ': ' + errorThrown);
      }
    });
  }

  // Private method to destroy a session
  function destroySession(callbacks) {
    callbacks = callbacks || {};
    // FIXME This method triggers a success even when we fail
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    var unload = callbacks.unload === true;
    var notifyDestroyed = true;
    if (
      callbacks.notifyDestroyed !== undefined &&
      callbacks.notifyDestroyed !== null
    )
      notifyDestroyed = callbacks.notifyDestroyed === true;
    var cleanupHandles = callbacks.cleanupHandles === true;
    Live.log('Destroying session ' + sessionId + ' (unload=' + unload + ')');
    if (!sessionId) {
      Live.warn('No session to destroy');
      callbacks.success();
      if (notifyDestroyed) gatewayCallbacks.destroyed();
      return;
    }
    if (cleanupHandles) {
      for (var handleId in pluginHandles)
        destroyHandle(handleId, {
          noRequest: true
        });
    }
    if (!connected) {
      Live.warn('Is the server down? (connected=false)');
      sessionId = null;
      callbacks.success();
      return;
    }
    // No need to destroy all handles first, Live will do that itself
    var request = {
      janus: 'destroy',
      transaction: Live.randomString(12)
    };
    if (token) request['token'] = token;
    if (apisecret) request['apisecret'] = apisecret;
    if (unload) {
      // We're unloading the page: use sendBeacon for HTTP instead,
      // or just close the WebSocket connection if we're using that
      if (websockets) {
        ws.onclose = null;
        ws.close();
        ws = null;
      } else {
        navigator.sendBeacon(server + '/' + sessionId, JSON.stringify(request));
      }
      Live.log('Destroyed session:');
      sessionId = null;
      connected = false;
      callbacks.success();
      if (notifyDestroyed) gatewayCallbacks.destroyed();
      return;
    }
    if (websockets) {
      request['session_id'] = sessionId;

      var unbindWebSocket = function() {
        for (var eventName in wsHandlers) {
          ws.removeEventListener(eventName, wsHandlers[eventName]);
        }
        ws.removeEventListener('message', onUnbindMessage);
        ws.removeEventListener('error', onUnbindError);
        if (wsKeepaliveTimeoutId) {
          clearTimeout(wsKeepaliveTimeoutId);
        }
        ws.close();
      };

      var onUnbindMessage = function(event) {
        var data = JSON.parse(event.data);
        if (
          data.session_id == request.session_id &&
          data.transaction == request.transaction
        ) {
          unbindWebSocket();
          callbacks.success();
          if (notifyDestroyed) gatewayCallbacks.destroyed();
        }
      };
      var onUnbindError = function(event) {
        unbindWebSocket();
        callbacks.error('Failed to destroy the server: Is the server down?');
        if (notifyDestroyed) gatewayCallbacks.destroyed();
      };

      ws.addEventListener('message', onUnbindMessage);
      ws.addEventListener('error', onUnbindError);

      ws.send(JSON.stringify(request));
      return;
    }
    Live.httpAPICall(server + '/' + sessionId, {
      verb: 'POST',
      withCredentials: withCredentials,
      body: request,
      success: function(json) {
        Live.log('Destroyed session:');
        Live.debug(json);
        sessionId = null;
        connected = false;
        if (json['janus'] !== 'success') {
          Live.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          ); // FIXME
        }
        callbacks.success();
        if (notifyDestroyed) gatewayCallbacks.destroyed();
      },
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown); // FIXME
        // Reset everything anyway
        sessionId = null;
        connected = false;
        callbacks.success();
        if (notifyDestroyed) gatewayCallbacks.destroyed();
      }
    });
  }

  // Private method to create a plugin handle
  function createHandle(callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    callbacks.consentDialog =
      typeof callbacks.consentDialog == 'function'
        ? callbacks.consentDialog
        : Live.noop;
    callbacks.iceState =
      typeof callbacks.iceState == 'function' ? callbacks.iceState : Live.noop;
    callbacks.mediaState =
      typeof callbacks.mediaState == 'function'
        ? callbacks.mediaState
        : Live.noop;
    callbacks.webrtcState =
      typeof callbacks.webrtcState == 'function'
        ? callbacks.webrtcState
        : Live.noop;
    callbacks.slowLink =
      typeof callbacks.slowLink == 'function' ? callbacks.slowLink : Live.noop;
    callbacks.onmessage =
      typeof callbacks.onmessage == 'function'
        ? callbacks.onmessage
        : Live.noop;
    callbacks.onlocalstream =
      typeof callbacks.onlocalstream == 'function'
        ? callbacks.onlocalstream
        : Live.noop;
    callbacks.onremotestream =
      typeof callbacks.onremotestream == 'function'
        ? callbacks.onremotestream
        : Live.noop;
    callbacks.ondata =
      typeof callbacks.ondata == 'function' ? callbacks.ondata : Live.noop;
    callbacks.ondataopen =
      typeof callbacks.ondataopen == 'function'
        ? callbacks.ondataopen
        : Live.noop;
    callbacks.oncleanup =
      typeof callbacks.oncleanup == 'function'
        ? callbacks.oncleanup
        : Live.noop;
    callbacks.ondetached =
      typeof callbacks.ondetached == 'function'
        ? callbacks.ondetached
        : Live.noop;
    if (!connected) {
      Live.warn('Is the server down? (connected=false)');
      callbacks.error('Is the server down? (connected=false)');
      return;
    }
    var plugin = callbacks.plugin;
    if (!plugin) {
      Live.error('Invalid plugin');
      callbacks.error('Invalid plugin');
      return;
    }
    var opaqueId = callbacks.opaqueId;
    var handleToken = callbacks.token ? callbacks.token : token;
    var transaction = Live.randomString(12);
    var request = {
      janus: 'attach',
      plugin: plugin,
      opaque_id: opaqueId,
      transaction: transaction
    };
    if (handleToken) request['token'] = handleToken;
    if (apisecret) request['apisecret'] = apisecret;
    if (websockets) {
      transactions[transaction] = function(json) {
        Live.debug(json);
        if (json['janus'] !== 'success') {
          Live.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          ); // FIXME
          callbacks.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          );
          return;
        }
        var handleId = json.data['id'];
        Live.log('Created handle: ' + handleId);
        var pluginHandle = {
          session: that,
          plugin: plugin,
          id: handleId,
          token: handleToken,
          detached: false,
          webrtcStuff: {
            started: false,
            myStream: null,
            streamExternal: false,
            remoteStream: null,
            mySdp: null,
            mediaConstraints: null,
            pc: null,
            dataChannel: {},
            dtmfSender: null,
            trickle: true,
            iceDone: false,
            volume: {
              value: null,
              timer: null
            },
            bitrate: {
              value: null,
              bsnow: null,
              bsbefore: null,
              tsnow: null,
              tsbefore: null,
              timer: null
            }
          },
          getId: function() {
            return handleId;
          },
          getPlugin: function() {
            return plugin;
          },
          getVolume: function() {
            return getVolume(handleId, true);
          },
          getRemoteVolume: function() {
            return getVolume(handleId, true);
          },
          getLocalVolume: function() {
            return getVolume(handleId, false);
          },
          isAudioMuted: function() {
            return isMuted(handleId, false);
          },
          muteAudio: function() {
            return mute(handleId, false, true);
          },
          unmuteAudio: function() {
            return mute(handleId, false, false);
          },
          isVideoMuted: function() {
            return isMuted(handleId, true);
          },
          muteVideo: function() {
            return mute(handleId, true, true);
          },
          unmuteVideo: function() {
            return mute(handleId, true, false);
          },
          getBitrate: function() {
            return getBitrate(handleId);
          },
          send: function(callbacks) {
            sendMessage(handleId, callbacks);
          },
          data: function(callbacks) {
            sendData(handleId, callbacks);
          },
          dtmf: function(callbacks) {
            sendDtmf(handleId, callbacks);
          },
          consentDialog: callbacks.consentDialog,
          iceState: callbacks.iceState,
          mediaState: callbacks.mediaState,
          webrtcState: callbacks.webrtcState,
          slowLink: callbacks.slowLink,
          onmessage: callbacks.onmessage,
          createOffer: function(callbacks) {
            prepareWebrtc(handleId, true, callbacks);
          },
          createAnswer: function(callbacks) {
            prepareWebrtc(handleId, false, callbacks);
          },
          handleRemoteJsep: function(callbacks) {
            prepareWebrtcPeer(handleId, callbacks);
          },
          onlocalstream: callbacks.onlocalstream,
          onremotestream: callbacks.onremotestream,
          ondata: callbacks.ondata,
          ondataopen: callbacks.ondataopen,
          oncleanup: callbacks.oncleanup,
          ondetached: callbacks.ondetached,
          hangup: function(sendRequest) {
            cleanupWebrtc(handleId, sendRequest === true);
          },
          detach: function(callbacks) {
            destroyHandle(handleId, callbacks);
          }
        };
        pluginHandles[handleId] = pluginHandle;
        callbacks.success(pluginHandle);
      };
      request['session_id'] = sessionId;
      ws.send(JSON.stringify(request));
      return;
    }
    Live.httpAPICall(server + '/' + sessionId, {
      verb: 'POST',
      withCredentials: withCredentials,
      body: request,
      success: function(json) {
        Live.debug(json);
        if (json['janus'] !== 'success') {
          Live.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          ); // FIXME
          callbacks.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          );
          return;
        }
        var handleId = json.data['id'];
        Live.log('Created handle: ' + handleId);
        var pluginHandle = {
          session: that,
          plugin: plugin,
          id: handleId,
          token: handleToken,
          detached: false,
          webrtcStuff: {
            started: false,
            myStream: null,
            streamExternal: false,
            remoteStream: null,
            mySdp: null,
            mediaConstraints: null,
            pc: null,
            dataChannel: {},
            dtmfSender: null,
            trickle: true,
            iceDone: false,
            volume: {
              value: null,
              timer: null
            },
            bitrate: {
              value: null,
              bsnow: null,
              bsbefore: null,
              tsnow: null,
              tsbefore: null,
              timer: null
            }
          },
          getId: function() {
            return handleId;
          },
          getPlugin: function() {
            return plugin;
          },
          getVolume: function() {
            return getVolume(handleId, true);
          },
          getRemoteVolume: function() {
            return getVolume(handleId, true);
          },
          getLocalVolume: function() {
            return getVolume(handleId, false);
          },
          isAudioMuted: function() {
            return isMuted(handleId, false);
          },
          muteAudio: function() {
            return mute(handleId, false, true);
          },
          unmuteAudio: function() {
            return mute(handleId, false, false);
          },
          isVideoMuted: function() {
            return isMuted(handleId, true);
          },
          muteVideo: function() {
            return mute(handleId, true, true);
          },
          unmuteVideo: function() {
            return mute(handleId, true, false);
          },
          getBitrate: function() {
            return getBitrate(handleId);
          },
          send: function(callbacks) {
            sendMessage(handleId, callbacks);
          },
          data: function(callbacks) {
            sendData(handleId, callbacks);
          },
          dtmf: function(callbacks) {
            sendDtmf(handleId, callbacks);
          },
          consentDialog: callbacks.consentDialog,
          iceState: callbacks.iceState,
          mediaState: callbacks.mediaState,
          webrtcState: callbacks.webrtcState,
          slowLink: callbacks.slowLink,
          onmessage: callbacks.onmessage,
          createOffer: function(callbacks) {
            prepareWebrtc(handleId, true, callbacks);
          },
          createAnswer: function(callbacks) {
            prepareWebrtc(handleId, false, callbacks);
          },
          handleRemoteJsep: function(callbacks) {
            prepareWebrtcPeer(handleId, callbacks);
          },
          onlocalstream: callbacks.onlocalstream,
          onremotestream: callbacks.onremotestream,
          ondata: callbacks.ondata,
          ondataopen: callbacks.ondataopen,
          oncleanup: callbacks.oncleanup,
          ondetached: callbacks.ondetached,
          hangup: function(sendRequest) {
            cleanupWebrtc(handleId, sendRequest === true);
          },
          detach: function(callbacks) {
            destroyHandle(handleId, callbacks);
          }
        };
        pluginHandles[handleId] = pluginHandle;
        callbacks.success(pluginHandle);
      },
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown); // FIXME
        if (errorThrown === '')
          callbacks.error(textStatus + ': Is the server down?');
        else callbacks.error(textStatus + ': ' + errorThrown);
      }
    });
  }

  // Private method to send a message
  function sendMessage(handleId, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    if (!connected) {
      Live.warn('Is the server down? (connected=false)');
      callbacks.error('Is the server down? (connected=false)');
      return;
    }
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var message = callbacks.message;
    var jsep = callbacks.jsep;
    var transaction = Live.randomString(12);
    var request = {
      janus: 'message',
      body: message,
      transaction: transaction
    };
    if (pluginHandle.token) request['token'] = pluginHandle.token;
    if (apisecret) request['apisecret'] = apisecret;
    if (jsep) request.jsep = jsep;
    Live.debug('Sending message to plugin (handle=' + handleId + '):');
    Live.debug(request);
    if (websockets) {
      request['session_id'] = sessionId;
      request['handle_id'] = handleId;
      transactions[transaction] = function(json) {
        Live.debug('Message sent!');
        Live.debug(json);
        if (json['janus'] === 'success') {
          // We got a success, must have been a synchronous transaction
          var plugindata = json['plugindata'];
          if (!plugindata) {
            Live.warn('Request succeeded, but missing plugindata...');
            callbacks.success();
            return;
          }
          Live.log(
            'Synchronous transaction successful (' + plugindata['plugin'] + ')'
          );
          var data = plugindata['data'];
          Live.debug(data);
          callbacks.success(data);
          return;
        } else if (json['janus'] !== 'ack') {
          // Not a success and not an ack, must be an error
          if (json['error']) {
            Live.error(
              'Ooops: ' + json['error'].code + ' ' + json['error'].reason
            ); // FIXME
            callbacks.error(json['error'].code + ' ' + json['error'].reason);
          } else {
            Live.error('Unknown error'); // FIXME
            callbacks.error('Unknown error');
          }
          return;
        }
        // If we got here, the plugin decided to handle the request asynchronously
        callbacks.success();
      };
      ws.send(JSON.stringify(request));
      return;
    }
    Live.httpAPICall(server + '/' + sessionId + '/' + handleId, {
      verb: 'POST',
      withCredentials: withCredentials,
      body: request,
      success: function(json) {
        Live.debug('Message sent!');
        Live.debug(json);
        if (json['janus'] === 'success') {
          // We got a success, must have been a synchronous transaction
          var plugindata = json['plugindata'];
          if (!plugindata) {
            Live.warn('Request succeeded, but missing plugindata...');
            callbacks.success();
            return;
          }
          Live.log(
            'Synchronous transaction successful (' + plugindata['plugin'] + ')'
          );
          var data = plugindata['data'];
          Live.debug(data);
          callbacks.success(data);
          return;
        } else if (json['janus'] !== 'ack') {
          // Not a success and not an ack, must be an error
          if (json['error']) {
            Live.error(
              'Ooops: ' + json['error'].code + ' ' + json['error'].reason
            ); // FIXME
            callbacks.error(json['error'].code + ' ' + json['error'].reason);
          } else {
            Live.error('Unknown error'); // FIXME
            callbacks.error('Unknown error');
          }
          return;
        }
        // If we got here, the plugin decided to handle the request asynchronously
        callbacks.success();
      },
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown); // FIXME
        callbacks.error(textStatus + ': ' + errorThrown);
      }
    });
  }

  // Private method to send a trickle candidate
  function sendTrickleCandidate(handleId, candidate) {
    if (!connected) {
      Live.warn('Is the server down? (connected=false)');
      return;
    }
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      return;
    }
    var request = {
      janus: 'trickle',
      candidate: candidate,
      transaction: Live.randomString(12)
    };
    if (pluginHandle.token) request['token'] = pluginHandle.token;
    if (apisecret) request['apisecret'] = apisecret;
    Live.vdebug('Sending trickle candidate (handle=' + handleId + '):');
    Live.vdebug(request);
    if (websockets) {
      request['session_id'] = sessionId;
      request['handle_id'] = handleId;
      ws.send(JSON.stringify(request));
      return;
    }
    Live.httpAPICall(server + '/' + sessionId + '/' + handleId, {
      verb: 'POST',
      withCredentials: withCredentials,
      body: request,
      success: function(json) {
        Live.vdebug('Candidate sent!');
        Live.vdebug(json);
        if (json['janus'] !== 'ack') {
          Live.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          ); // FIXME
          return;
        }
      },
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown); // FIXME
      }
    });
  }

  // Private method to create a data channel
  function createDataChannel(
    handleId,
    dclabel,
    dcprotocol,
    incoming,
    pendingData
  ) {
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    var onDataChannelMessage = function(event) {
      Live.log('Received message on data channel:', event);
      var label = event.target.label;
      pluginHandle.ondata(event.data, label);
    };
    var onDataChannelStateChange = function(event) {
      Live.log('Received state change on data channel:', event);
      var label = event.target.label;
      var protocol = event.target.protocol;
      var dcState = config.dataChannel[label]
        ? config.dataChannel[label].readyState
        : 'null';
      Live.log('State change on <' + label + '> data channel: ' + dcState);
      if (dcState === 'open') {
        // Any pending messages to send?
        if (
          config.dataChannel[label].pending &&
          config.dataChannel[label].pending.length > 0
        ) {
          Live.log(
            'Sending pending messages on <' + label + '>:',
            config.dataChannel[label].pending.length
          );
          for (var data of config.dataChannel[label].pending) {
            Live.log('Sending data on data channel <' + label + '>');
            Live.debug(data);
            config.dataChannel[label].send(data);
          }
          config.dataChannel[label].pending = [];
        }
        // Notify the open data channel
        pluginHandle.ondataopen(label, protocol);
      }
    };
    var onDataChannelError = function(error) {
      Live.error('Got error on data channel:', error);
      // TODO
    };
    if (!incoming) {
      // FIXME Add options (ordered, maxRetransmits, etc.)
      var dcoptions = {
        ordered: true
      };
      if (dcprotocol) dcoptions.protocol = dcprotocol;
      config.dataChannel[dclabel] = config.pc.createDataChannel(
        dclabel,
        dcoptions
      );
    } else {
      // The channel was created by Live
      config.dataChannel[dclabel] = incoming;
    }
    config.dataChannel[dclabel].onmessage = onDataChannelMessage;
    config.dataChannel[dclabel].onopen = onDataChannelStateChange;
    config.dataChannel[dclabel].onclose = onDataChannelStateChange;
    config.dataChannel[dclabel].onerror = onDataChannelError;
    config.dataChannel[dclabel].pending = [];
    if (pendingData) config.dataChannel[dclabel].pending.push(pendingData);
  }

  // Private method to send a data channel message
  function sendData(handleId, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    var data = callbacks.text || callbacks.data;
    if (!data) {
      Live.warn('Invalid data');
      callbacks.error('Invalid data');
      return;
    }
    var label = callbacks.label ? callbacks.label : Live.dataChanDefaultLabel;
    if (!config.dataChannel[label]) {
      // Create new data channel and wait for it to open
      createDataChannel(
        handleId,
        label,
        callbacks.protocol,
        false,
        data,
        callbacks.protocol
      );
      callbacks.success();
      return;
    }
    if (config.dataChannel[label].readyState !== 'open') {
      config.dataChannel[label].pending.push(data);
      callbacks.success();
      return;
    }
    Live.log('Sending data on data channel <' + label + '>');
    Live.debug(data);
    config.dataChannel[label].send(data);
    callbacks.success();
  }

  // Private method to send a DTMF tone
  function sendDtmf(handleId, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    if (!config.dtmfSender) {
      // Create the DTMF sender the proper way, if possible
      if (config.pc) {
        var senders = config.pc.getSenders();
        var audioSender = senders.find(function(sender) {
          return sender.track && sender.track.kind === 'audio';
        });
        if (!audioSender) {
          Live.warn('Invalid DTMF configuration (no audio track)');
          callbacks.error('Invalid DTMF configuration (no audio track)');
          return;
        }
        config.dtmfSender = audioSender.dtmf;
        if (config.dtmfSender) {
          Live.log('Created DTMF Sender');
          config.dtmfSender.ontonechange = function(tone) {
            Live.debug('Sent DTMF tone: ' + tone.tone);
          };
        }
      }
      if (!config.dtmfSender) {
        Live.warn('Invalid DTMF configuration');
        callbacks.error('Invalid DTMF configuration');
        return;
      }
    }
    var dtmf = callbacks.dtmf;
    if (!dtmf) {
      Live.warn('Invalid DTMF parameters');
      callbacks.error('Invalid DTMF parameters');
      return;
    }
    var tones = dtmf.tones;
    if (!tones) {
      Live.warn('Invalid DTMF string');
      callbacks.error('Invalid DTMF string');
      return;
    }
    var duration = typeof dtmf.duration === 'number' ? dtmf.duration : 500; // We choose 500ms as the default duration for a tone
    var gap = typeof dtmf.gap === 'number' ? dtmf.gap : 50; // We choose 50ms as the default gap between tones
    Live.debug(
      'Sending DTMF string ' +
        tones +
        ' (duration ' +
        duration +
        'ms, gap ' +
        gap +
        'ms)'
    );
    config.dtmfSender.insertDTMF(tones, duration, gap);
    callbacks.success();
  }

  // Private method to destroy a plugin handle
  function destroyHandle(handleId, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    var noRequest = callbacks.noRequest === true;
    Live.log(
      'Destroying handle ' + handleId + ' (only-locally=' + noRequest + ')'
    );
    cleanupWebrtc(handleId);
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || pluginHandle.detached) {
      // Plugin was already detached by Live, calling detach again will return a handle not found error, so just exit here
      delete pluginHandles[handleId];
      callbacks.success();
      return;
    }
    if (noRequest) {
      // We're only removing the handle locally
      delete pluginHandles[handleId];
      callbacks.success();
      return;
    }
    if (!connected) {
      Live.warn('Is the server down? (connected=false)');
      callbacks.error('Is the server down? (connected=false)');
      return;
    }
    var request = {
      janus: 'detach',
      transaction: Live.randomString(12)
    };
    if (pluginHandle.token) request['token'] = pluginHandle.token;
    if (apisecret) request['apisecret'] = apisecret;
    if (websockets) {
      request['session_id'] = sessionId;
      request['handle_id'] = handleId;
      ws.send(JSON.stringify(request));
      delete pluginHandles[handleId];
      callbacks.success();
      return;
    }
    Live.httpAPICall(server + '/' + sessionId + '/' + handleId, {
      verb: 'POST',
      withCredentials: withCredentials,
      body: request,
      success: function(json) {
        Live.log('Destroyed handle:');
        Live.debug(json);
        if (json['janus'] !== 'success') {
          Live.error(
            'Ooops: ' + json['error'].code + ' ' + json['error'].reason
          ); // FIXME
        }
        delete pluginHandles[handleId];
        callbacks.success();
      },
      error: function(textStatus, errorThrown) {
        Live.error(textStatus + ':', errorThrown); // FIXME
        // We cleanup anyway
        delete pluginHandles[handleId];
        callbacks.success();
      }
    });
  }

  // WebRTC stuff
  function streamsDone(handleId, jsep, media, callbacks, stream) {
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    Live.debug('streamsDone:', stream);
    if (stream) {
      Live.debug('  -- Audio tracks:', stream.getAudioTracks());
      Live.debug('  -- Video tracks:', stream.getVideoTracks());
    }
    // We're now capturing the new stream: check if we're updating or if it's a new thing
    var addTracks = false;
    if (!config.myStream || !media.update || config.streamExternal) {
      config.myStream = stream;
      addTracks = true;
    } else {
      // We only need to update the existing stream
      if (
        ((!media.update && isAudioSendEnabled(media)) ||
          (media.update && (media.addAudio || media.replaceAudio))) &&
        stream.getAudioTracks() &&
        stream.getAudioTracks().length
      ) {
        config.myStream.addTrack(stream.getAudioTracks()[0]);
        if (Live.unifiedPlan) {
          // Use Transceivers
          Live.log(
            (media.replaceAudio ? 'Replacing' : 'Adding') + ' audio track:',
            stream.getAudioTracks()[0]
          );
          var audioTransceiver = null;
          var transceivers = config.pc.getTransceivers();
          if (transceivers && transceivers.length > 0) {
            for (var t of transceivers) {
              if (
                (t.sender &&
                  t.sender.track &&
                  t.sender.track.kind === 'audio') ||
                (t.receiver &&
                  t.receiver.track &&
                  t.receiver.track.kind === 'audio')
              ) {
                audioTransceiver = t;
                break;
              }
            }
          }
          if (audioTransceiver && audioTransceiver.sender) {
            audioTransceiver.sender.replaceTrack(stream.getAudioTracks()[0]);
          } else {
            config.pc.addTrack(stream.getAudioTracks()[0], stream);
          }
        } else {
          Live.log(
            (media.replaceAudio ? 'Replacing' : 'Adding') + ' audio track:',
            stream.getAudioTracks()[0]
          );
          config.pc.addTrack(stream.getAudioTracks()[0], stream);
        }
      }
      if (
        ((!media.update && isVideoSendEnabled(media)) ||
          (media.update && (media.addVideo || media.replaceVideo))) &&
        stream.getVideoTracks() &&
        stream.getVideoTracks().length
      ) {
        config.myStream.addTrack(stream.getVideoTracks()[0]);
        if (Live.unifiedPlan) {
          // Use Transceivers
          Live.log(
            (media.replaceVideo ? 'Replacing' : 'Adding') + ' video track:',
            stream.getVideoTracks()[0]
          );
          var videoTransceiver = null;
          var transceivers = config.pc.getTransceivers();
          if (transceivers && transceivers.length > 0) {
            for (var t of transceivers) {
              if (
                (t.sender &&
                  t.sender.track &&
                  t.sender.track.kind === 'video') ||
                (t.receiver &&
                  t.receiver.track &&
                  t.receiver.track.kind === 'video')
              ) {
                videoTransceiver = t;
                break;
              }
            }
          }
          if (videoTransceiver && videoTransceiver.sender) {
            videoTransceiver.sender.replaceTrack(stream.getVideoTracks()[0]);
          } else {
            config.pc.addTrack(stream.getVideoTracks()[0], stream);
          }
        } else {
          Live.log(
            (media.replaceVideo ? 'Replacing' : 'Adding') + ' video track:',
            stream.getVideoTracks()[0]
          );
          config.pc.addTrack(stream.getVideoTracks()[0], stream);
        }
      }
    }
    // If we still need to create a PeerConnection, let's do that
    if (!config.pc) {
      var pc_config = {
        iceServers: iceServers,
        iceTransportPolicy: iceTransportPolicy,
        bundlePolicy: bundlePolicy
      };
      if (Live.webRTCAdapter.browserDetails.browser === 'chrome') {
        // For Chrome versions before 72, we force a plan-b semantic, and unified-plan otherwise
        pc_config['sdpSemantics'] =
          Live.webRTCAdapter.browserDetails.version < 72
            ? 'plan-b'
            : 'unified-plan';
      }
      var pc_constraints = {
        optional: [
          {
            DtlsSrtpKeyAgreement: true
          }
        ]
      };
      if (ipv6Support) {
        pc_constraints.optional.push({
          googIPv6: true
        });
      }
      // Any custom constraint to add?
      if (
        callbacks.rtcConstraints &&
        typeof callbacks.rtcConstraints === 'object'
      ) {
        Live.debug(
          'Adding custom PeerConnection constraints:',
          callbacks.rtcConstraints
        );
        for (var i in callbacks.rtcConstraints) {
          pc_constraints.optional.push(callbacks.rtcConstraints[i]);
        }
      }
      if (Live.webRTCAdapter.browserDetails.browser === 'edge') {
        // This is Edge, enable BUNDLE explicitly
        pc_config.bundlePolicy = 'max-bundle';
      }
      Live.log('Creating PeerConnection');
      Live.debug(pc_constraints);
      config.pc = new RTCPeerConnection(pc_config, pc_constraints);
      Live.debug(config.pc);
      if (config.pc.getStats) {
        // FIXME
        config.volume = {};
        config.bitrate.value = '0 kbits/sec';
      }
      Live.log(
        'Preparing local SDP and gathering candidates (trickle=' +
          config.trickle +
          ')'
      );
      config.pc.oniceconnectionstatechange = function(e) {
        if (config.pc) pluginHandle.iceState(config.pc.iceConnectionState);
      };
      config.pc.onicecandidate = function(event) {
        if (
          !event.candidate ||
          (Live.webRTCAdapter.browserDetails.browser === 'edge' &&
            event.candidate.candidate.indexOf('endOfCandidates') > 0)
        ) {
          Live.log('End of candidates.');
          config.iceDone = true;
          if (config.trickle === true) {
            // Notify end of candidates
            sendTrickleCandidate(handleId, {
              completed: true
            });
          } else {
            // No trickle, time to send the complete SDP (including all candidates)
            sendSDP(handleId, callbacks);
          }
        } else {
          // JSON.stringify doesn't work on some WebRTC objects anymore
          // See https://code.google.com/p/chromium/issues/detail?id=467366
          var candidate = {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          };
          if (config.trickle === true) {
            // Send candidate
            sendTrickleCandidate(handleId, candidate);
          }
        }
      };
      config.pc.ontrack = function(event) {
        Live.log('Handling Remote Track');
        Live.debug(event);
        if (!event.streams) return;
        config.remoteStream = event.streams[0];
        pluginHandle.onremotestream(config.remoteStream);
        if (event.track.onended) return;
        var trackMutedTimeoutId = null;
        Live.log('Adding onended callback to track:', event.track);
        event.track.onended = function(ev) {
          Live.log('Remote track removed:', ev);
          if (config.remoteStream) {
            clearTimeout(trackMutedTimeoutId);
            config.remoteStream.removeTrack(ev.target);
            pluginHandle.onremotestream(config.remoteStream);
          }
        };
        event.track.onmute = function(ev) {
          Live.log('Remote track muted:', ev);
          if (config.remoteStream && trackMutedTimeoutId == null) {
            trackMutedTimeoutId = setTimeout(function() {
              Live.log('Removing remote track');
              config.remoteStream.removeTrack(ev.target);
              pluginHandle.onremotestream(config.remoteStream);
              trackMutedTimeoutId = null;
              // Chrome seems to raise mute events only at multiples of 834ms;
              // we set the timeout to three times this value (rounded to 840ms)
            }, 3 * 840);
          }
        };
        event.track.onunmute = function(ev) {
          Live.log('Remote track flowing again:', ev);
          if (trackMutedTimeoutId != null) {
            clearTimeout(trackMutedTimeoutId);
            trackMutedTimeoutId = null;
          } else {
            try {
              config.remoteStream.addTrack(ev.target);
              pluginHandle.onremotestream(config.remoteStream);
            } catch (e) {
              Live.error(e);
            }
          }
        };
      };
    }
    if (addTracks && stream) {
      Live.log('Adding local stream');
      var simulcast2 = callbacks.simulcast2 === true;
      stream.getTracks().forEach(function(track) {
        Live.log('Adding local track:', track);
        if (!simulcast2) {
          config.pc.addTrack(track, stream);
        } else {
          if (track.kind === 'audio') {
            config.pc.addTrack(track, stream);
          } else {
            Live.log('Enabling rid-based simulcasting:', track);
            var maxBitrates = getMaxBitrates(callbacks.simulcastMaxBitrates);
            config.pc.addTransceiver(track, {
              direction: 'sendrecv',
              streams: [stream],
              sendEncodings: [
                {
                  rid: 'h',
                  active: true,
                  maxBitrate: maxBitrates.high
                },
                {
                  rid: 'm',
                  active: true,
                  maxBitrate: maxBitrates.medium,
                  scaleResolutionDownBy: 2
                },
                {
                  rid: 'l',
                  active: true,
                  maxBitrate: maxBitrates.low,
                  scaleResolutionDownBy: 4
                }
              ]
            });
          }
        }
      });
    }
    // Any data channel to create?
    if (
      isDataEnabled(media) &&
      !config.dataChannel[Live.dataChanDefaultLabel]
    ) {
      Live.log('Creating default data channel');
      createDataChannel(handleId, Live.dataChanDefaultLabel, null, false);
      config.pc.ondatachannel = function(event) {
        Live.log('Data channel created by Live:', event);
        createDataChannel(
          handleId,
          event.channel.label,
          event.channel.protocol,
          event.channel
        );
      };
    }
    // If there's a new local stream, let's notify the application
    if (config.myStream) {
      pluginHandle.onlocalstream(config.myStream);
    }
    // Create offer/answer now
    if (!jsep) {
      createOffer(handleId, media, callbacks);
    } else {
      config.pc.setRemoteDescription(jsep).then(function() {
        Live.log('Remote description accepted!');
        config.remoteSdp = jsep.sdp;
        // Any trickle candidate we cached?
        if (config.candidates && config.candidates.length > 0) {
          for (var i = 0; i < config.candidates.length; i++) {
            var candidate = config.candidates[i];
            Live.debug('Adding remote candidate:', candidate);
            if (!candidate || candidate.completed === true) {
              // end-of-candidates
              config.pc.addIceCandidate(Live.endOfCandidates);
            } else {
              // New candidate
              config.pc.addIceCandidate(candidate);
            }
          }
          config.candidates = [];
        }
        // Create the answer now
        createAnswer(handleId, media, callbacks);
      }, callbacks.error);
    }
  }

  function prepareWebrtc(handleId, offer, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : webrtcError;
    var jsep = callbacks.jsep;
    if (offer && jsep) {
      Live.error('Provided a JSEP to a createOffer');
      callbacks.error('Provided a JSEP to a createOffer');
      return;
    } else if (!offer && (!jsep || !jsep.type || !jsep.sdp)) {
      Live.error('A valid JSEP is required for createAnswer');
      callbacks.error('A valid JSEP is required for createAnswer');
      return;
    }
    /* Check that callbacks.media is a (not null) Object */
    callbacks.media =
      typeof callbacks.media === 'object' && callbacks.media
        ? callbacks.media
        : {
            audio: true,
            video: true
          };
    var media = callbacks.media;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    config.trickle = isTrickleEnabled(callbacks.trickle);
    // Are we updating a session?
    if (!config.pc) {
      // Nope, new PeerConnection
      media.update = false;
      media.keepAudio = false;
      media.keepVideo = false;
    } else {
      Live.log('Updating existing media session');
      media.update = true;
      // Check if there's anything to add/remove/replace, or if we
      // can go directly to preparing the new SDP offer or answer
      if (callbacks.stream) {
        // External stream: is this the same as the one we were using before?
        if (callbacks.stream !== config.myStream) {
          Live.log('Renegotiation involves a new external stream');
        }
      } else {
        // Check if there are changes on audio
        if (media.addAudio) {
          media.keepAudio = false;
          media.replaceAudio = false;
          media.removeAudio = false;
          media.audioSend = true;
          if (
            config.myStream &&
            config.myStream.getAudioTracks() &&
            config.myStream.getAudioTracks().length
          ) {
            Live.error("Can't add audio stream, there already is one");
            callbacks.error("Can't add audio stream, there already is one");
            return;
          }
        } else if (media.removeAudio) {
          media.keepAudio = false;
          media.replaceAudio = false;
          media.addAudio = false;
          media.audioSend = false;
        } else if (media.replaceAudio) {
          media.keepAudio = false;
          media.addAudio = false;
          media.removeAudio = false;
          media.audioSend = true;
        }
        if (!config.myStream) {
          // No media stream: if we were asked to replace, it's actually an "add"
          if (media.replaceAudio) {
            media.keepAudio = false;
            media.replaceAudio = false;
            media.addAudio = true;
            media.audioSend = true;
          }
          if (isAudioSendEnabled(media)) {
            media.keepAudio = false;
            media.addAudio = true;
          }
        } else {
          if (
            !config.myStream.getAudioTracks() ||
            config.myStream.getAudioTracks().length === 0
          ) {
            // No audio track: if we were asked to replace, it's actually an "add"
            if (media.replaceAudio) {
              media.keepAudio = false;
              media.replaceAudio = false;
              media.addAudio = true;
              media.audioSend = true;
            }
            if (isAudioSendEnabled(media)) {
              media.keepAudio = false;
              media.addAudio = true;
            }
          } else {
            // We have an audio track: should we keep it as it is?
            if (
              isAudioSendEnabled(media) &&
              !media.removeAudio &&
              !media.replaceAudio
            ) {
              media.keepAudio = true;
            }
          }
        }
        // Check if there are changes on video
        if (media.addVideo) {
          media.keepVideo = false;
          media.replaceVideo = false;
          media.removeVideo = false;
          media.videoSend = true;
          if (
            config.myStream &&
            config.myStream.getVideoTracks() &&
            config.myStream.getVideoTracks().length
          ) {
            Live.error("Can't add video stream, there already is one");
            callbacks.error("Can't add video stream, there already is one");
            return;
          }
        } else if (media.removeVideo) {
          media.keepVideo = false;
          media.replaceVideo = false;
          media.addVideo = false;
          media.videoSend = false;
        } else if (media.replaceVideo) {
          media.keepVideo = false;
          media.addVideo = false;
          media.removeVideo = false;
          media.videoSend = true;
        }
        if (!config.myStream) {
          // No media stream: if we were asked to replace, it's actually an "add"
          if (media.replaceVideo) {
            media.keepVideo = false;
            media.replaceVideo = false;
            media.addVideo = true;
            media.videoSend = true;
          }
          if (isVideoSendEnabled(media)) {
            media.keepVideo = false;
            media.addVideo = true;
          }
        } else {
          if (
            !config.myStream.getVideoTracks() ||
            config.myStream.getVideoTracks().length === 0
          ) {
            // No video track: if we were asked to replace, it's actually an "add"
            if (media.replaceVideo) {
              media.keepVideo = false;
              media.replaceVideo = false;
              media.addVideo = true;
              media.videoSend = true;
            }
            if (isVideoSendEnabled(media)) {
              media.keepVideo = false;
              media.addVideo = true;
            }
          } else {
            // We have a video track: should we keep it as it is?
            if (
              isVideoSendEnabled(media) &&
              !media.removeVideo &&
              !media.replaceVideo
            ) {
              media.keepVideo = true;
            }
          }
        }
        // Data channels can only be added
        if (media.addData) {
          media.data = true;
        }
      }
      // If we're updating and keeping all tracks, let's skip the getUserMedia part
      if (
        isAudioSendEnabled(media) &&
        media.keepAudio &&
        isVideoSendEnabled(media) &&
        media.keepVideo
      ) {
        pluginHandle.consentDialog(false);
        streamsDone(handleId, jsep, media, callbacks, config.myStream);
        return;
      }
    }
    // If we're updating, check if we need to remove/replace one of the tracks
    if (media.update && !config.streamExternal) {
      if (media.removeAudio || media.replaceAudio) {
        if (
          config.myStream &&
          config.myStream.getAudioTracks() &&
          config.myStream.getAudioTracks().length
        ) {
          var at = config.myStream.getAudioTracks()[0];
          Live.log('Removing audio track:', at);
          config.myStream.removeTrack(at);
          try {
            at.stop();
          } catch (e) {}
        }
        if (config.pc.getSenders() && config.pc.getSenders().length) {
          var ra = true;
          if (media.replaceAudio && Live.unifiedPlan) {
            // We can use replaceTrack
            ra = false;
          }
          if (ra) {
            for (var asnd of config.pc.getSenders()) {
              if (asnd && asnd.track && asnd.track.kind === 'audio') {
                Live.log('Removing audio sender:', asnd);
                config.pc.removeTrack(asnd);
              }
            }
          }
        }
      }
      if (media.removeVideo || media.replaceVideo) {
        if (
          config.myStream &&
          config.myStream.getVideoTracks() &&
          config.myStream.getVideoTracks().length
        ) {
          var vt = config.myStream.getVideoTracks()[0];
          Live.log('Removing video track:', vt);
          config.myStream.removeTrack(vt);
          try {
            vt.stop();
          } catch (e) {}
        }
        if (config.pc.getSenders() && config.pc.getSenders().length) {
          var rv = true;
          if (media.replaceVideo && Live.unifiedPlan) {
            // We can use replaceTrack
            rv = false;
          }
          if (rv) {
            for (var vsnd of config.pc.getSenders()) {
              if (vsnd && vsnd.track && vsnd.track.kind === 'video') {
                Live.log('Removing video sender:', vsnd);
                config.pc.removeTrack(vsnd);
              }
            }
          }
        }
      }
    }
    // Was a MediaStream object passed, or do we need to take care of that?
    if (callbacks.stream) {
      var stream = callbacks.stream;
      Live.log('MediaStream provided by the application');
      Live.debug(stream);
      // If this is an update, let's check if we need to release the previous stream
      if (media.update) {
        if (
          config.myStream &&
          config.myStream !== callbacks.stream &&
          !config.streamExternal
        ) {
          // We're replacing a stream we captured ourselves with an external one
          try {
            // Try a MediaStreamTrack.stop() for each track
            var tracks = config.myStream.getTracks();
            for (var mst of tracks) {
              Live.log(mst);
              if (mst) mst.stop();
            }
          } catch (e) {
            // Do nothing if this fails
          }
          config.myStream = null;
        }
      }
      // Skip the getUserMedia part
      config.streamExternal = true;
      pluginHandle.consentDialog(false);
      streamsDone(handleId, jsep, media, callbacks, stream);
      return;
    }
    if (isAudioSendEnabled(media) || isVideoSendEnabled(media)) {
      if (!Live.isGetUserMediaAvailable()) {
        callbacks.error('getUserMedia not available');
        return;
      }
      var constraints = {
        mandatory: {},
        optional: []
      };
      pluginHandle.consentDialog(true);
      var audioSupport = isAudioSendEnabled(media);
      if (audioSupport && media && typeof media.audio === 'object')
        audioSupport = media.audio;
      var videoSupport = isVideoSendEnabled(media);
      if (videoSupport && media) {
        var simulcast = callbacks.simulcast === true;
        var simulcast2 = callbacks.simulcast2 === true;
        if ((simulcast || simulcast2) && !jsep && !media.video)
          media.video = 'hires';
        if (media.video && media.video != 'screen' && media.video != 'window') {
          if (typeof media.video === 'object') {
            videoSupport = media.video;
          } else {
            var width = 0;
            var height = 0,
              maxHeight = 0;
            if (media.video === 'lowres') {
              // Small resolution, 4:3
              height = 240;
              maxHeight = 240;
              width = 320;
            } else if (media.video === 'lowres-16:9') {
              // Small resolution, 16:9
              height = 180;
              maxHeight = 180;
              width = 320;
            } else if (
              media.video === 'hires' ||
              media.video === 'hires-16:9' ||
              media.video === 'hdres'
            ) {
              // High(HD) resolution is only 16:9
              height = 720;
              maxHeight = 720;
              width = 1280;
            } else if (media.video === 'fhdres') {
              // Full HD resolution is only 16:9
              height = 1080;
              maxHeight = 1080;
              width = 1920;
            } else if (media.video === '4kres') {
              // 4K resolution is only 16:9
              height = 2160;
              maxHeight = 2160;
              width = 3840;
            } else if (media.video === 'stdres') {
              // Normal resolution, 4:3
              height = 480;
              maxHeight = 480;
              width = 640;
            } else if (media.video === 'stdres-16:9') {
              // Normal resolution, 16:9
              height = 360;
              maxHeight = 360;
              width = 640;
            } else {
              Live.log('Default video setting is stdres 4:3');
              height = 480;
              maxHeight = 480;
              width = 640;
            }
            Live.log('Adding media constraint:', media.video);
            videoSupport = {
              height: {
                ideal: height
              },
              width: {
                ideal: width
              }
            };
            Live.log('Adding video constraint:', videoSupport);
          }
        } else if (media.video === 'screen' || media.video === 'window') {
          if (
            navigator.mediaDevices &&
            navigator.mediaDevices.getDisplayMedia
          ) {
            // The new experimental getDisplayMedia API is available, let's use that
            // https://groups.google.com/forum/#!topic/discuss-webrtc/Uf0SrR4uxzk
            // https://webrtchacks.com/chrome-screensharing-getdisplaymedia/
            constraints.video = {};
            if (media.screenshareFrameRate) {
              constraints.video.frameRate = media.screenshareFrameRate;
            }
            if (media.screenshareHeight) {
              constraints.video.height = media.screenshareHeight;
            }
            if (media.screenshareWidth) {
              constraints.video.width = media.screenshareWidth;
            }
            constraints.audio = media.captureDesktopAudio;
            desktopCapturer
              .getSources({
                types: ['window', 'screen']
              })
              .then(async sources => {
                //const source = sources.find(item => item.name === '云砚直播');
                const source = sources.find(
                  item => item.name.indexOf('云砚直播') > -1
                );
                try {
                  let video1 = {};
                  let playId = media.playId ? media.playId : source.id;
                  video1.mandatory = {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: playId
                  };
                  //添加视频轨
                  let stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: video1 //设置true 为摄像头
                  });
                  //添加音频轨
                  let audioTracks = await navigator.mediaDevices
                    .getUserMedia({ audio: true, video: false })
                    .then(mediaStream => mediaStream.getAudioTracks()[0]);
                  stream.addTrack(audioTracks);
                  streamsDone(handleId, jsep, media, callbacks, stream);
                } catch (error) {
                  callbacks.error(error);
                }
              });
            // navigator.mediaDevices.getDisplayMedia(constraints).then(
            //   function(stream) {
            //     pluginHandle.consentDialog(false);
            //     if (isAudioSendEnabled(media) && !media.keepAudio) {
            //       navigator.mediaDevices
            //         .getUserMedia({
            //           audio: true,
            //           video: false
            //         })
            //         .then(function(audioStream) {
            //           stream.addTrack(audioStream.getAudioTracks()[0]);
            //           streamsDone(handleId, jsep, media, callbacks, stream);
            //         });
            //     } else {
            //       streamsDone(handleId, jsep, media, callbacks, stream);
            //     }
            //   },
            //   function(error) {
            //     pluginHandle.consentDialog(false);
            //     callbacks.error(error);
            //   }
            // );
            return;
          }
          // We're going to try and use the extension for Chrome 34+, the old approach
          // for older versions of Chrome, or the experimental support in Firefox 33+
          function callbackUserMedia(error, stream) {
            pluginHandle.consentDialog(false);
            if (error) {
              callbacks.error(error);
            } else {
              streamsDone(handleId, jsep, media, callbacks, stream);
            }
          }

          function getScreenMedia(constraints, gsmCallback, useAudio) {
            Live.log('Adding media constraint (screen capture)');
            Live.debug(constraints);
            navigator.mediaDevices
              .getUserMedia(constraints)
              .then(function(stream) {
                if (useAudio) {
                  navigator.mediaDevices
                    .getUserMedia({
                      audio: true,
                      video: false
                    })
                    .then(function(audioStream) {
                      stream.addTrack(audioStream.getAudioTracks()[0]);
                      gsmCallback(null, stream);
                    });
                } else {
                  gsmCallback(null, stream);
                }
              })
              .catch(function(error) {
                pluginHandle.consentDialog(false);
                gsmCallback(error);
              });
          }
          if (Live.webRTCAdapter.browserDetails.browser === 'chrome') {
            var chromever = Live.webRTCAdapter.browserDetails.version;
            var maxver = 33;
            if (window.navigator.userAgent.match('Linux')) maxver = 35; // "known" crash in chrome 34 and 35 on linux
            if (chromever >= 26 && chromever <= maxver) {
              // Chrome 26->33 requires some awkward chrome://flags manipulation
              constraints = {
                video: {
                  mandatory: {
                    googLeakyBucket: true,
                    maxWidth: window.screen.width,
                    maxHeight: window.screen.height,
                    minFrameRate: media.screenshareFrameRate,
                    maxFrameRate: media.screenshareFrameRate,
                    chromeMediaSource: 'screen'
                  }
                },
                audio: isAudioSendEnabled(media) && !media.keepAudio
              };
              getScreenMedia(constraints, callbackUserMedia);
            } else {
              // Chrome 34+ requires an extension
              Live.extension.getScreen(function(error, sourceId) {
                if (error) {
                  pluginHandle.consentDialog(false);
                  return callbacks.error(error);
                }
                constraints = {
                  audio: false,
                  video: {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      maxWidth: window.screen.width,
                      maxHeight: window.screen.height,
                      minFrameRate: media.screenshareFrameRate,
                      maxFrameRate: media.screenshareFrameRate
                    },
                    optional: [
                      {
                        googLeakyBucket: true
                      },
                      {
                        googTemporalLayeredScreencast: true
                      }
                    ]
                  }
                };
                constraints.video.mandatory.chromeMediaSourceId = sourceId;
                getScreenMedia(
                  constraints,
                  callbackUserMedia,
                  isAudioSendEnabled(media) && !media.keepAudio
                );
              });
            }
          } else if (Live.webRTCAdapter.browserDetails.browser === 'firefox') {
            if (Live.webRTCAdapter.browserDetails.version >= 33) {
              // Firefox 33+ has experimental support for screen sharing
              constraints = {
                video: {
                  mozMediaSource: media.video,
                  mediaSource: media.video
                },
                audio: isAudioSendEnabled(media) && !media.keepAudio
              };
              getScreenMedia(constraints, function(err, stream) {
                callbackUserMedia(err, stream);
                // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1045810
                if (!err) {
                  var lastTime = stream.currentTime;
                  var polly = window.setInterval(function() {
                    if (!stream) window.clearInterval(polly);
                    if (stream.currentTime == lastTime) {
                      window.clearInterval(polly);
                      if (stream.onended) {
                        stream.onended();
                      }
                    }
                    lastTime = stream.currentTime;
                  }, 500);
                }
              });
            } else {
              var error = new Error('NavigatorUserMediaError');
              error.name =
                'Your version of Firefox does not support screen sharing, please install Firefox 33 (or more recent versions)';
              pluginHandle.consentDialog(false);
              callbacks.error(error);
              return;
            }
          }
          return;
        }
      }
      // If we got here, we're not screensharing
      if (!media || media.video !== 'screen') {
        // Check whether all media sources are actually available or not
        navigator.mediaDevices
          .enumerateDevices()
          .then(function(devices) {
            var audioExist = devices.some(function(device) {
                return device.kind === 'audioinput';
              }),
              videoExist =
                isScreenSendEnabled(media) ||
                devices.some(function(device) {
                  return device.kind === 'videoinput';
                });

            // Check whether a missing device is really a problem
            var audioSend = isAudioSendEnabled(media);
            var videoSend = isVideoSendEnabled(media);
            var needAudioDevice = isAudioSendRequired(media);
            var needVideoDevice = isVideoSendRequired(media);
            if (audioSend || videoSend || needAudioDevice || needVideoDevice) {
              // We need to send either audio or video
              var haveAudioDevice = audioSend ? audioExist : false;
              var haveVideoDevice = videoSend ? videoExist : false;
              if (!haveAudioDevice && !haveVideoDevice) {
                // FIXME Should we really give up, or just assume recvonly for both?
                pluginHandle.consentDialog(false);
                callbacks.error('No capture device found');
                return false;
              } else if (!haveAudioDevice && needAudioDevice) {
                pluginHandle.consentDialog(false);
                callbacks.error(
                  'Audio capture is required, but no capture device found'
                );
                return false;
              } else if (!haveVideoDevice && needVideoDevice) {
                pluginHandle.consentDialog(false);
                callbacks.error(
                  'Video capture is required, but no capture device found'
                );
                return false;
              }
            }
            var gumConstraints = {
              audio: audioExist && !media.keepAudio ? audioSupport : false,
              video: videoExist && !media.keepVideo ? videoSupport : false
            };
            Live.debug('getUserMedia constraints', gumConstraints);
            if (!gumConstraints.audio && !gumConstraints.video) {
              pluginHandle.consentDialog(false);
              streamsDone(handleId, jsep, media, callbacks, stream);
            } else {
              navigator.mediaDevices
                .getUserMedia(gumConstraints)
                .then(function(stream) {
                  pluginHandle.consentDialog(false);
                  streamsDone(handleId, jsep, media, callbacks, stream);
                })
                .catch(function(error) {
                  pluginHandle.consentDialog(false);
                  callbacks.error({
                    code: error.code,
                    name: error.name,
                    message: error.message
                  });
                });
            }
          })
          .catch(function(error) {
            pluginHandle.consentDialog(false);
            callbacks.error('enumerateDevices error', error);
          });
      }
    } else {
      // No need to do a getUserMedia, create offer/answer right away
      streamsDone(handleId, jsep, media, callbacks);
    }
  }

  function prepareWebrtcPeer(handleId, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : webrtcError;
    var jsep = callbacks.jsep;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    if (jsep) {
      if (!config.pc) {
        Live.warn(
          'Wait, no PeerConnection?? if this is an answer, use createAnswer and not handleRemoteJsep'
        );
        callbacks.error(
          'No PeerConnection: if this is an answer, use createAnswer and not handleRemoteJsep'
        );
        return;
      }
      config.pc.setRemoteDescription(jsep).then(function() {
        Live.log('Remote description accepted!');
        config.remoteSdp = jsep.sdp;
        // Any trickle candidate we cached?
        if (config.candidates && config.candidates.length > 0) {
          for (var i = 0; i < config.candidates.length; i++) {
            var candidate = config.candidates[i];
            Live.debug('Adding remote candidate:', candidate);
            if (!candidate || candidate.completed === true) {
              // end-of-candidates
              config.pc.addIceCandidate(Live.endOfCandidates);
            } else {
              // New candidate
              config.pc.addIceCandidate(candidate);
            }
          }
          config.candidates = [];
        }
        // Done
        callbacks.success();
      }, callbacks.error);
    } else {
      callbacks.error('Invalid JSEP');
    }
  }

  function createOffer(handleId, media, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    callbacks.customizeSdp =
      typeof callbacks.customizeSdp == 'function'
        ? callbacks.customizeSdp
        : Live.noop;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    var simulcast = callbacks.simulcast === true;
    if (!simulcast) {
      Live.log('Creating offer (iceDone=' + config.iceDone + ')');
    } else {
      Live.log(
        'Creating offer (iceDone=' +
          config.iceDone +
          ', simulcast=' +
          simulcast +
          ')'
      );
    }
    // https://code.google.com/p/webrtc/issues/detail?id=3508
    var mediaConstraints = {};
    if (Live.unifiedPlan) {
      // We can use Transceivers
      var audioTransceiver = null,
        videoTransceiver = null;
      var transceivers = config.pc.getTransceivers();
      if (transceivers && transceivers.length > 0) {
        for (var t of transceivers) {
          if (
            (t.sender && t.sender.track && t.sender.track.kind === 'audio') ||
            (t.receiver &&
              t.receiver.track &&
              t.receiver.track.kind === 'audio')
          ) {
            if (!audioTransceiver) {
              audioTransceiver = t;
            }
            continue;
          }
          if (
            (t.sender && t.sender.track && t.sender.track.kind === 'video') ||
            (t.receiver &&
              t.receiver.track &&
              t.receiver.track.kind === 'video')
          ) {
            if (!videoTransceiver) {
              videoTransceiver = t;
            }
            continue;
          }
        }
      }
      // Handle audio (and related changes, if any)
      var audioSend = isAudioSendEnabled(media);
      var audioRecv = isAudioRecvEnabled(media);
      if (!audioSend && !audioRecv) {
        // Audio disabled: have we removed it?
        if (media.removeAudio && audioTransceiver) {
          if (audioTransceiver.setDirection) {
            audioTransceiver.setDirection('inactive');
          } else {
            audioTransceiver.direction = 'inactive';
          }
          Live.log('Setting audio transceiver to inactive:', audioTransceiver);
        }
      } else {
        // Take care of audio m-line
        if (audioSend && audioRecv) {
          if (audioTransceiver) {
            if (audioTransceiver.setDirection) {
              audioTransceiver.setDirection('sendrecv');
            } else {
              audioTransceiver.direction = 'sendrecv';
            }
            Live.log(
              'Setting audio transceiver to sendrecv:',
              audioTransceiver
            );
          }
        } else if (audioSend && !audioRecv) {
          if (audioTransceiver) {
            if (audioTransceiver.setDirection) {
              audioTransceiver.setDirection('sendonly');
            } else {
              audioTransceiver.direction = 'sendonly';
            }
            Live.log(
              'Setting audio transceiver to sendonly:',
              audioTransceiver
            );
          }
        } else if (!audioSend && audioRecv) {
          if (audioTransceiver) {
            if (audioTransceiver.setDirection) {
              audioTransceiver.setDirection('recvonly');
            } else {
              audioTransceiver.direction = 'recvonly';
            }
            Live.log(
              'Setting audio transceiver to recvonly:',
              audioTransceiver
            );
          } else {
            // In theory, this is the only case where we might not have a transceiver yet
            audioTransceiver = config.pc.addTransceiver('audio', {
              direction: 'recvonly'
            });
            Live.log('Adding recvonly audio transceiver:', audioTransceiver);
          }
        }
      }
      // Handle video (and related changes, if any)
      var videoSend = isVideoSendEnabled(media);
      var videoRecv = isVideoRecvEnabled(media);
      if (!videoSend && !videoRecv) {
        // Video disabled: have we removed it?
        if (media.removeVideo && videoTransceiver) {
          if (videoTransceiver.setDirection) {
            videoTransceiver.setDirection('inactive');
          } else {
            videoTransceiver.direction = 'inactive';
          }
          Live.log('Setting video transceiver to inactive:', videoTransceiver);
        }
      } else {
        // Take care of video m-line
        if (videoSend && videoRecv) {
          if (videoTransceiver) {
            if (videoTransceiver.setDirection) {
              videoTransceiver.setDirection('sendrecv');
            } else {
              videoTransceiver.direction = 'sendrecv';
            }
            Live.log(
              'Setting video transceiver to sendrecv:',
              videoTransceiver
            );
          }
        } else if (videoSend && !videoRecv) {
          if (videoTransceiver) {
            if (videoTransceiver.setDirection) {
              videoTransceiver.setDirection('sendonly');
            } else {
              videoTransceiver.direction = 'sendonly';
            }
            Live.log(
              'Setting video transceiver to sendonly:',
              videoTransceiver
            );
          }
        } else if (!videoSend && videoRecv) {
          if (videoTransceiver) {
            if (videoTransceiver.setDirection) {
              videoTransceiver.setDirection('recvonly');
            } else {
              videoTransceiver.direction = 'recvonly';
            }
            Live.log(
              'Setting video transceiver to recvonly:',
              videoTransceiver
            );
          } else {
            // In theory, this is the only case where we might not have a transceiver yet
            videoTransceiver = config.pc.addTransceiver('video', {
              direction: 'recvonly'
            });
            Live.log('Adding recvonly video transceiver:', videoTransceiver);
          }
        }
      }
    } else {
      mediaConstraints['offerToReceiveAudio'] = isAudioRecvEnabled(media);
      mediaConstraints['offerToReceiveVideo'] = isVideoRecvEnabled(media);
    }
    var iceRestart = callbacks.iceRestart === true;
    if (iceRestart) {
      mediaConstraints['iceRestart'] = true;
    }
    Live.debug(mediaConstraints);
    // Check if this is Firefox and we've been asked to do simulcasting
    var sendVideo = isVideoSendEnabled(media);
    if (
      sendVideo &&
      simulcast &&
      Live.webRTCAdapter.browserDetails.browser === 'firefox'
    ) {
      // FIXME Based on https://gist.github.com/voluntas/088bc3cc62094730647b
      Live.log('Enabling Simulcasting for Firefox (RID)');
      var sender = config.pc.getSenders().find(function(s) {
        return s.track.kind === 'video';
      });
      if (sender) {
        var parameters = sender.getParameters();
        if (!parameters) {
          parameters = {};
        }
        var maxBitrates = getMaxBitrates(callbacks.simulcastMaxBitrates);
        parameters.encodings = [
          {
            rid: 'h',
            active: true,
            maxBitrate: maxBitrates.high
          },
          {
            rid: 'm',
            active: true,
            maxBitrate: maxBitrates.medium,
            scaleResolutionDownBy: 2
          },
          {
            rid: 'l',
            active: true,
            maxBitrate: maxBitrates.low,
            scaleResolutionDownBy: 4
          }
        ];
        sender.setParameters(parameters);
      }
    }
    config.pc.createOffer(mediaConstraints).then(function(offer) {
      Live.debug(offer);
      // JSON.stringify doesn't work on some WebRTC objects anymore
      // See https://code.google.com/p/chromium/issues/detail?id=467366
      var jsep = {
        type: offer.type,
        sdp: offer.sdp
      };
      callbacks.customizeSdp(jsep);
      offer.sdp = jsep.sdp;
      Live.log('Setting local description');
      if (sendVideo && simulcast) {
        // This SDP munging only works with Chrome (Safari STP may support it too)
        if (
          Live.webRTCAdapter.browserDetails.browser === 'chrome' ||
          Live.webRTCAdapter.browserDetails.browser === 'safari'
        ) {
          Live.log('Enabling Simulcasting for Chrome (SDP munging)');
          offer.sdp = mungeSdpForSimulcasting(offer.sdp);
        } else if (Live.webRTCAdapter.browserDetails.browser !== 'firefox') {
          Live.warn(
            'simulcast=true, but this is not Chrome nor Firefox, ignoring'
          );
        }
      }
      config.mySdp = offer.sdp;
      config.pc.setLocalDescription(offer).catch(callbacks.error);
      config.mediaConstraints = mediaConstraints;
      if (!config.iceDone && !config.trickle) {
        // Don't do anything until we have all candidates
        Live.log('Waiting for all candidates...');
        return;
      }
      Live.log('Offer ready');
      Live.debug(callbacks);
      callbacks.success(offer);
    }, callbacks.error);
  }

  function createAnswer(handleId, media, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    callbacks.customizeSdp =
      typeof callbacks.customizeSdp == 'function'
        ? callbacks.customizeSdp
        : Live.noop;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      callbacks.error('Invalid handle');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    var simulcast = callbacks.simulcast === true;
    if (!simulcast) {
      Live.log('Creating answer (iceDone=' + config.iceDone + ')');
    } else {
      Live.log(
        'Creating answer (iceDone=' +
          config.iceDone +
          ', simulcast=' +
          simulcast +
          ')'
      );
    }
    var mediaConstraints = null;
    if (Live.unifiedPlan) {
      // We can use Transceivers
      mediaConstraints = {};
      var audioTransceiver = null,
        videoTransceiver = null;
      var transceivers = config.pc.getTransceivers();
      if (transceivers && transceivers.length > 0) {
        for (var t of transceivers) {
          if (
            (t.sender && t.sender.track && t.sender.track.kind === 'audio') ||
            (t.receiver &&
              t.receiver.track &&
              t.receiver.track.kind === 'audio')
          ) {
            if (!audioTransceiver) audioTransceiver = t;
            continue;
          }
          if (
            (t.sender && t.sender.track && t.sender.track.kind === 'video') ||
            (t.receiver &&
              t.receiver.track &&
              t.receiver.track.kind === 'video')
          ) {
            if (!videoTransceiver) videoTransceiver = t;
            continue;
          }
        }
      }
      // Handle audio (and related changes, if any)
      var audioSend = isAudioSendEnabled(media);
      var audioRecv = isAudioRecvEnabled(media);
      if (!audioSend && !audioRecv) {
        // Audio disabled: have we removed it?
        if (media.removeAudio && audioTransceiver) {
          try {
            if (audioTransceiver.setDirection) {
              audioTransceiver.setDirection('inactive');
            } else {
              audioTransceiver.direction = 'inactive';
            }
            Live.log(
              'Setting audio transceiver to inactive:',
              audioTransceiver
            );
          } catch (e) {
            Live.error(e);
          }
        }
      } else {
        // Take care of audio m-line
        if (audioSend && audioRecv) {
          if (audioTransceiver) {
            try {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection('sendrecv');
              } else {
                audioTransceiver.direction = 'sendrecv';
              }
              Live.log(
                'Setting audio transceiver to sendrecv:',
                audioTransceiver
              );
            } catch (e) {
              Live.error(e);
            }
          }
        } else if (audioSend && !audioRecv) {
          try {
            if (audioTransceiver) {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection('sendonly');
              } else {
                audioTransceiver.direction = 'sendonly';
              }
              Live.log(
                'Setting audio transceiver to sendonly:',
                audioTransceiver
              );
            }
          } catch (e) {
            Live.error(e);
          }
        } else if (!audioSend && audioRecv) {
          if (audioTransceiver) {
            try {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection('recvonly');
              } else {
                audioTransceiver.direction = 'recvonly';
              }
              Live.log(
                'Setting audio transceiver to recvonly:',
                audioTransceiver
              );
            } catch (e) {
              Live.error(e);
            }
          } else {
            // In theory, this is the only case where we might not have a transceiver yet
            audioTransceiver = config.pc.addTransceiver('audio', {
              direction: 'recvonly'
            });
            Live.log('Adding recvonly audio transceiver:', audioTransceiver);
          }
        }
      }
      // Handle video (and related changes, if any)
      var videoSend = isVideoSendEnabled(media);
      var videoRecv = isVideoRecvEnabled(media);
      if (!videoSend && !videoRecv) {
        // Video disabled: have we removed it?
        if (media.removeVideo && videoTransceiver) {
          try {
            if (videoTransceiver.setDirection) {
              videoTransceiver.setDirection('inactive');
            } else {
              videoTransceiver.direction = 'inactive';
            }
            Live.log(
              'Setting video transceiver to inactive:',
              videoTransceiver
            );
          } catch (e) {
            Live.error(e);
          }
        }
      } else {
        // Take care of video m-line
        if (videoSend && videoRecv) {
          if (videoTransceiver) {
            try {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection('sendrecv');
              } else {
                videoTransceiver.direction = 'sendrecv';
              }
              Live.log(
                'Setting video transceiver to sendrecv:',
                videoTransceiver
              );
            } catch (e) {
              Live.error(e);
            }
          }
        } else if (videoSend && !videoRecv) {
          if (videoTransceiver) {
            try {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection('sendonly');
              } else {
                videoTransceiver.direction = 'sendonly';
              }
              Live.log(
                'Setting video transceiver to sendonly:',
                videoTransceiver
              );
            } catch (e) {
              Live.error(e);
            }
          }
        } else if (!videoSend && videoRecv) {
          if (videoTransceiver) {
            try {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection('recvonly');
              } else {
                videoTransceiver.direction = 'recvonly';
              }
              Live.log(
                'Setting video transceiver to recvonly:',
                videoTransceiver
              );
            } catch (e) {
              Live.error(e);
            }
          } else {
            // In theory, this is the only case where we might not have a transceiver yet
            videoTransceiver = config.pc.addTransceiver('video', {
              direction: 'recvonly'
            });
            Live.log('Adding recvonly video transceiver:', videoTransceiver);
          }
        }
      }
    } else {
      if (
        Live.webRTCAdapter.browserDetails.browser === 'firefox' ||
        Live.webRTCAdapter.browserDetails.browser === 'edge'
      ) {
        mediaConstraints = {
          offerToReceiveAudio: isAudioRecvEnabled(media),
          offerToReceiveVideo: isVideoRecvEnabled(media)
        };
      } else {
        mediaConstraints = {
          mandatory: {
            OfferToReceiveAudio: isAudioRecvEnabled(media),
            OfferToReceiveVideo: isVideoRecvEnabled(media)
          }
        };
      }
    }
    Live.debug(mediaConstraints);
    // Check if this is Firefox and we've been asked to do simulcasting
    var sendVideo = isVideoSendEnabled(media);
    if (
      sendVideo &&
      simulcast &&
      Live.webRTCAdapter.browserDetails.browser === 'firefox'
    ) {
      // FIXME Based on https://gist.github.com/voluntas/088bc3cc62094730647b
      Live.log('Enabling Simulcasting for Firefox (RID)');
      var sender = config.pc.getSenders()[1];
      Live.log(sender);
      var parameters = sender.getParameters();
      Live.log(parameters);

      var maxBitrates = getMaxBitrates(callbacks.simulcastMaxBitrates);
      sender.setParameters({
        encodings: [
          {
            rid: 'high',
            active: true,
            priority: 'high',
            maxBitrate: maxBitrates.high
          },
          {
            rid: 'medium',
            active: true,
            priority: 'medium',
            maxBitrate: maxBitrates.medium
          },
          {
            rid: 'low',
            active: true,
            priority: 'low',
            maxBitrate: maxBitrates.low
          }
        ]
      });
    }
    config.pc.createAnswer(mediaConstraints).then(function(answer) {
      Live.debug(answer);
      // JSON.stringify doesn't work on some WebRTC objects anymore
      // See https://code.google.com/p/chromium/issues/detail?id=467366
      var jsep = {
        type: answer.type,
        sdp: answer.sdp
      };
      callbacks.customizeSdp(jsep);
      answer.sdp = jsep.sdp;
      Live.log('Setting local description');
      if (sendVideo && simulcast) {
        // This SDP munging only works with Chrome
        if (Live.webRTCAdapter.browserDetails.browser === 'chrome') {
          // FIXME Apparently trying to simulcast when answering breaks video in Chrome...
          //~ Live.log("Enabling Simulcasting for Chrome (SDP munging)");
          //~ answer.sdp = mungeSdpForSimulcasting(answer.sdp);
          Live.warn(
            'simulcast=true, but this is an answer, and video breaks in Chrome if we enable it'
          );
        } else if (Live.webRTCAdapter.browserDetails.browser !== 'firefox') {
          Live.warn(
            'simulcast=true, but this is not Chrome nor Firefox, ignoring'
          );
        }
      }
      config.mySdp = answer.sdp;
      config.pc.setLocalDescription(answer).catch(callbacks.error);
      config.mediaConstraints = mediaConstraints;
      if (!config.iceDone && !config.trickle) {
        // Don't do anything until we have all candidates
        Live.log('Waiting for all candidates...');
        return;
      }
      callbacks.success(answer);
    }, callbacks.error);
  }

  function sendSDP(handleId, callbacks) {
    callbacks = callbacks || {};
    callbacks.success =
      typeof callbacks.success == 'function' ? callbacks.success : Live.noop;
    callbacks.error =
      typeof callbacks.error == 'function' ? callbacks.error : Live.noop;
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle, not sending anything');
      return;
    }
    var config = pluginHandle.webrtcStuff;
    Live.log('Sending offer/answer SDP...');
    if (!config.mySdp) {
      Live.warn('Local SDP instance is invalid, not sending anything...');
      return;
    }
    config.mySdp = {
      type: config.pc.localDescription.type,
      sdp: config.pc.localDescription.sdp
    };
    if (config.trickle === false) config.mySdp['trickle'] = false;
    Live.debug(callbacks);
    config.sdpSent = true;
    callbacks.success(config.mySdp);
  }

  function getVolume(handleId, remote) {
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      return 0;
    }
    var stream = remote ? 'remote' : 'local';
    var config = pluginHandle.webrtcStuff;
    if (!config.volume[stream])
      config.volume[stream] = {
        value: 0
      };
    // Start getting the volume, if audioLevel in getStats is supported (apparently
    // they're only available in Chrome/Safari right now: https://webrtc-stats.callstats.io/)
    if (
      config.pc.getStats &&
      (Live.webRTCAdapter.browserDetails.browser === 'chrome' ||
        Live.webRTCAdapter.browserDetails.browser === 'safari')
    ) {
      if (remote && !config.remoteStream) {
        Live.warn('Remote stream unavailable');
        return 0;
      } else if (!remote && !config.myStream) {
        Live.warn('Local stream unavailable');
        return 0;
      }
      if (!config.volume[stream].timer) {
        Live.log('Starting ' + stream + ' volume monitor');
        config.volume[stream].timer = setInterval(function() {
          config.pc.getStats().then(function(stats) {
            stats.forEach(function(res) {
              if (!res || res.kind !== 'audio') return;
              if (
                (remote && !res.remoteSource) ||
                (!remote && res.type !== 'media-source')
              )
                return;
              config.volume[stream].value = res.audioLevel ? res.audioLevel : 0;
            });
          });
        }, 200);
        return 0; // We don't have a volume to return yet
      }
      return config.volume[stream].value;
    } else {
      // audioInputLevel and audioOutputLevel seem only available in Chrome? audioLevel
      // seems to be available on Chrome and Firefox, but they don't seem to work
      Live.warn('Getting the ' + stream + ' volume unsupported by browser');
      return 0;
    }
  }

  function isMuted(handleId, video) {
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      return true;
    }
    var config = pluginHandle.webrtcStuff;
    if (!config.pc) {
      Live.warn('Invalid PeerConnection');
      return true;
    }
    if (!config.myStream) {
      Live.warn('Invalid local MediaStream');
      return true;
    }
    if (video) {
      // Check video track
      if (
        !config.myStream.getVideoTracks() ||
        config.myStream.getVideoTracks().length === 0
      ) {
        Live.warn('No video track');
        return true;
      }
      return !config.myStream.getVideoTracks()[0].enabled;
    } else {
      // Check audio track
      if (
        !config.myStream.getAudioTracks() ||
        config.myStream.getAudioTracks().length === 0
      ) {
        Live.warn('No audio track');
        return true;
      }
      return !config.myStream.getAudioTracks()[0].enabled;
    }
  }

  function mute(handleId, video, mute) {
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      return false;
    }
    var config = pluginHandle.webrtcStuff;
    if (!config.pc) {
      Live.warn('Invalid PeerConnection');
      return false;
    }
    if (!config.myStream) {
      Live.warn('Invalid local MediaStream');
      return false;
    }
    if (video) {
      // Mute/unmute video track
      if (
        !config.myStream.getVideoTracks() ||
        config.myStream.getVideoTracks().length === 0
      ) {
        Live.warn('No video track');
        return false;
      }
      config.myStream.getVideoTracks()[0].enabled = !mute;
      return true;
    } else {
      // Mute/unmute audio track
      if (
        !config.myStream.getAudioTracks() ||
        config.myStream.getAudioTracks().length === 0
      ) {
        Live.warn('No audio track');
        return false;
      }
      config.myStream.getAudioTracks()[0].enabled = !mute;
      return true;
    }
  }

  function getBitrate(handleId) {
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle || !pluginHandle.webrtcStuff) {
      Live.warn('Invalid handle');
      return 'Invalid handle';
    }
    var config = pluginHandle.webrtcStuff;
    if (!config.pc) return 'Invalid PeerConnection';
    // Start getting the bitrate, if getStats is supported
    if (config.pc.getStats) {
      if (!config.bitrate.timer) {
        Live.log('Starting bitrate timer (via getStats)');
        config.bitrate.timer = setInterval(function() {
          config.pc.getStats().then(function(stats) {
            stats.forEach(function(res) {
              if (!res) return;
              var inStats = false;
              // Check if these are statistics on incoming media
              if (
                (res.mediaType === 'video' ||
                  res.id.toLowerCase().indexOf('video') > -1) &&
                res.type === 'inbound-rtp' &&
                res.id.indexOf('rtcp') < 0
              ) {
                // New stats
                inStats = true;
              } else if (
                res.type == 'ssrc' &&
                res.bytesReceived &&
                (res.googCodecName === 'VP8' || res.googCodecName === '')
              ) {
                // Older Chromer versions
                inStats = true;
              }
              // Parse stats now
              if (inStats) {
                config.bitrate.bsnow = res.bytesReceived;
                config.bitrate.tsnow = res.timestamp;
                if (
                  config.bitrate.bsbefore === null ||
                  config.bitrate.tsbefore === null
                ) {
                  // Skip this round
                  config.bitrate.bsbefore = config.bitrate.bsnow;
                  config.bitrate.tsbefore = config.bitrate.tsnow;
                } else {
                  // Calculate bitrate
                  var timePassed =
                    config.bitrate.tsnow - config.bitrate.tsbefore;
                  if (Live.webRTCAdapter.browserDetails.browser === 'safari')
                    timePassed = timePassed / 1000; // Apparently the timestamp is in microseconds, in Safari
                  var bitRate = Math.round(
                    ((config.bitrate.bsnow - config.bitrate.bsbefore) * 8) /
                      timePassed
                  );
                  if (Live.webRTCAdapter.browserDetails.browser === 'safari')
                    bitRate = parseInt(bitRate / 1000);
                  config.bitrate.value = bitRate + ' kbits/sec';
                  //~ Live.log("Estimated bitrate is " + config.bitrate.value);
                  config.bitrate.bsbefore = config.bitrate.bsnow;
                  config.bitrate.tsbefore = config.bitrate.tsnow;
                }
              }
            });
          });
        }, 1000);
        return '0 kbits/sec'; // We don't have a bitrate value yet
      }
      return config.bitrate.value;
    } else {
      Live.warn('Getting the video bitrate unsupported by browser');
      return 'Feature unsupported by browser';
    }
  }

  function webrtcError(error) {
    Live.error('WebRTC error:', error);
  }

  function cleanupWebrtc(handleId, hangupRequest) {
    Live.log('Cleaning WebRTC stuff');
    var pluginHandle = pluginHandles[handleId];
    if (!pluginHandle) {
      // Nothing to clean
      return;
    }
    var config = pluginHandle.webrtcStuff;
    if (config) {
      if (hangupRequest === true) {
        // Send a hangup request (we don't really care about the response)
        var request = {
          janus: 'hangup',
          transaction: Live.randomString(12)
        };
        if (pluginHandle.token) request['token'] = pluginHandle.token;
        if (apisecret) request['apisecret'] = apisecret;
        Live.debug('Sending hangup request (handle=' + handleId + '):');
        Live.debug(request);
        if (websockets) {
          request['session_id'] = sessionId;
          request['handle_id'] = handleId;
          ws.send(JSON.stringify(request));
        } else {
          Live.httpAPICall(server + '/' + sessionId + '/' + handleId, {
            verb: 'POST',
            withCredentials: withCredentials,
            body: request
          });
        }
      }
      // Cleanup stack
      config.remoteStream = null;
      if (config.volume) {
        if (config.volume['local'] && config.volume['local'].timer)
          clearInterval(config.volume['local'].timer);
        if (config.volume['remote'] && config.volume['remote'].timer)
          clearInterval(config.volume['remote'].timer);
      }
      config.volume = {};
      if (config.bitrate.timer) clearInterval(config.bitrate.timer);
      config.bitrate.timer = null;
      config.bitrate.bsnow = null;
      config.bitrate.bsbefore = null;
      config.bitrate.tsnow = null;
      config.bitrate.tsbefore = null;
      config.bitrate.value = null;
      try {
        // Try a MediaStreamTrack.stop() for each track
        if (!config.streamExternal && config.myStream) {
          Live.log('Stopping local stream tracks');
          var tracks = config.myStream.getTracks();
          for (var mst of tracks) {
            Live.log(mst);
            if (mst) mst.stop();
          }
        }
      } catch (e) {
        // Do nothing if this fails
      }
      config.streamExternal = false;
      config.myStream = null;
      // Close PeerConnection
      try {
        config.pc.close();
      } catch (e) {
        // Do nothing
      }
      config.pc = null;
      config.candidates = null;
      config.mySdp = null;
      config.remoteSdp = null;
      config.iceDone = false;
      config.dataChannel = {};
      config.dtmfSender = null;
    }
    pluginHandle.oncleanup();
  }

  // Helper method to munge an SDP to enable simulcasting (Chrome only)
  function mungeSdpForSimulcasting(sdp) {
    // Let's munge the SDP to add the attributes for enabling simulcasting
    // (based on https://gist.github.com/ggarber/a19b4c33510028b9c657)
    var lines = sdp.split('\r\n');
    var video = false;
    var ssrc = [-1],
      ssrc_fid = [-1];
    var cname = null,
      msid = null,
      mslabel = null,
      label = null;
    var insertAt = -1;
    for (var i = 0; i < lines.length; i++) {
      var mline = lines[i].match(/m=(\w+) */);
      if (mline) {
        var medium = mline[1];
        if (medium === 'video') {
          // New video m-line: make sure it's the first one
          if (ssrc[0] < 0) {
            video = true;
          } else {
            // We're done, let's add the new attributes here
            insertAt = i;
            break;
          }
        } else {
          // New non-video m-line: do we have what we were looking for?
          if (ssrc[0] > -1) {
            // We're done, let's add the new attributes here
            insertAt = i;
            break;
          }
        }
        continue;
      }
      if (!video) continue;
      var fid = lines[i].match(/a=ssrc-group:FID (\d+) (\d+)/);
      if (fid) {
        ssrc[0] = fid[1];
        ssrc_fid[0] = fid[2];
        lines.splice(i, 1);
        i--;
        continue;
      }
      if (ssrc[0]) {
        var match = lines[i].match('a=ssrc:' + ssrc[0] + ' cname:(.+)');
        if (match) {
          cname = match[1];
        }
        match = lines[i].match('a=ssrc:' + ssrc[0] + ' msid:(.+)');
        if (match) {
          msid = match[1];
        }
        match = lines[i].match('a=ssrc:' + ssrc[0] + ' mslabel:(.+)');
        if (match) {
          mslabel = match[1];
        }
        match = lines[i].match('a=ssrc:' + ssrc[0] + ' label:(.+)');
        if (match) {
          label = match[1];
        }
        if (lines[i].indexOf('a=ssrc:' + ssrc_fid[0]) === 0) {
          lines.splice(i, 1);
          i--;
          continue;
        }
        if (lines[i].indexOf('a=ssrc:' + ssrc[0]) === 0) {
          lines.splice(i, 1);
          i--;
          continue;
        }
      }
      if (lines[i].length == 0) {
        lines.splice(i, 1);
        i--;
        continue;
      }
    }
    if (ssrc[0] < 0) {
      // Couldn't find a FID attribute, let's just take the first video SSRC we find
      insertAt = -1;
      video = false;
      for (var i = 0; i < lines.length; i++) {
        var mline = lines[i].match(/m=(\w+) */);
        if (mline) {
          var medium = mline[1];
          if (medium === 'video') {
            // New video m-line: make sure it's the first one
            if (ssrc[0] < 0) {
              video = true;
            } else {
              // We're done, let's add the new attributes here
              insertAt = i;
              break;
            }
          } else {
            // New non-video m-line: do we have what we were looking for?
            if (ssrc[0] > -1) {
              // We're done, let's add the new attributes here
              insertAt = i;
              break;
            }
          }
          continue;
        }
        if (!video) continue;
        if (ssrc[0] < 0) {
          var value = lines[i].match(/a=ssrc:(\d+)/);
          if (value) {
            ssrc[0] = value[1];
            lines.splice(i, 1);
            i--;
            continue;
          }
        } else {
          var match = lines[i].match('a=ssrc:' + ssrc[0] + ' cname:(.+)');
          if (match) {
            cname = match[1];
          }
          match = lines[i].match('a=ssrc:' + ssrc[0] + ' msid:(.+)');
          if (match) {
            msid = match[1];
          }
          match = lines[i].match('a=ssrc:' + ssrc[0] + ' mslabel:(.+)');
          if (match) {
            mslabel = match[1];
          }
          match = lines[i].match('a=ssrc:' + ssrc[0] + ' label:(.+)');
          if (match) {
            label = match[1];
          }
          if (lines[i].indexOf('a=ssrc:' + ssrc_fid[0]) === 0) {
            lines.splice(i, 1);
            i--;
            continue;
          }
          if (lines[i].indexOf('a=ssrc:' + ssrc[0]) === 0) {
            lines.splice(i, 1);
            i--;
            continue;
          }
        }
        if (lines[i].length === 0) {
          lines.splice(i, 1);
          i--;
          continue;
        }
      }
    }
    if (ssrc[0] < 0) {
      // Still nothing, let's just return the SDP we were asked to munge
      Live.warn("Couldn't find the video SSRC, simulcasting NOT enabled");
      return sdp;
    }
    if (insertAt < 0) {
      // Append at the end
      insertAt = lines.length;
    }
    // Generate a couple of SSRCs (for retransmissions too)
    // Note: should we check if there are conflicts, here?
    ssrc[1] = Math.floor(Math.random() * 0xffffffff);
    ssrc[2] = Math.floor(Math.random() * 0xffffffff);
    ssrc_fid[1] = Math.floor(Math.random() * 0xffffffff);
    ssrc_fid[2] = Math.floor(Math.random() * 0xffffffff);
    // Add attributes to the SDP
    for (var i = 0; i < ssrc.length; i++) {
      if (cname) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc[i] + ' cname:' + cname);
        insertAt++;
      }
      if (msid) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc[i] + ' msid:' + msid);
        insertAt++;
      }
      if (mslabel) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc[i] + ' mslabel:' + mslabel);
        insertAt++;
      }
      if (label) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc[i] + ' label:' + label);
        insertAt++;
      }
      // Add the same info for the retransmission SSRC
      if (cname) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc_fid[i] + ' cname:' + cname);
        insertAt++;
      }
      if (msid) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc_fid[i] + ' msid:' + msid);
        insertAt++;
      }
      if (mslabel) {
        lines.splice(
          insertAt,
          0,
          'a=ssrc:' + ssrc_fid[i] + ' mslabel:' + mslabel
        );
        insertAt++;
      }
      if (label) {
        lines.splice(insertAt, 0, 'a=ssrc:' + ssrc_fid[i] + ' label:' + label);
        insertAt++;
      }
    }
    lines.splice(
      insertAt,
      0,
      'a=ssrc-group:FID ' + ssrc[2] + ' ' + ssrc_fid[2]
    );
    lines.splice(
      insertAt,
      0,
      'a=ssrc-group:FID ' + ssrc[1] + ' ' + ssrc_fid[1]
    );
    lines.splice(
      insertAt,
      0,
      'a=ssrc-group:FID ' + ssrc[0] + ' ' + ssrc_fid[0]
    );
    lines.splice(
      insertAt,
      0,
      'a=ssrc-group:SIM ' + ssrc[0] + ' ' + ssrc[1] + ' ' + ssrc[2]
    );
    sdp = lines.join('\r\n');
    if (!sdp.endsWith('\r\n')) sdp += '\r\n';
    return sdp;
  }

  // Helper methods to parse a media object
  function isAudioSendEnabled(media) {
    Live.debug('isAudioSendEnabled:', media);
    if (!media) return true; // Default
    if (media.audio === false) return false; // Generic audio has precedence
    if (media.audioSend === undefined || media.audioSend === null) return true; // Default
    return media.audioSend === true;
  }

  function isAudioSendRequired(media) {
    Live.debug('isAudioSendRequired:', media);
    if (!media) return false; // Default
    if (media.audio === false || media.audioSend === false) return false; // If we're not asking to capture audio, it's not required
    if (media.failIfNoAudio === undefined || media.failIfNoAudio === null)
      return false; // Default
    return media.failIfNoAudio === true;
  }

  function isAudioRecvEnabled(media) {
    Live.debug('isAudioRecvEnabled:', media);
    if (!media) return true; // Default
    if (media.audio === false) return false; // Generic audio has precedence
    if (media.audioRecv === undefined || media.audioRecv === null) return true; // Default
    return media.audioRecv === true;
  }

  function isVideoSendEnabled(media) {
    Live.debug('isVideoSendEnabled:', media);
    if (!media) return true; // Default
    if (media.video === false) return false; // Generic video has precedence
    if (media.videoSend === undefined || media.videoSend === null) return true; // Default
    return media.videoSend === true;
  }

  function isVideoSendRequired(media) {
    Live.debug('isVideoSendRequired:', media);
    if (!media) return false; // Default
    if (media.video === false || media.videoSend === false) return false; // If we're not asking to capture video, it's not required
    if (media.failIfNoVideo === undefined || media.failIfNoVideo === null)
      return false; // Default
    return media.failIfNoVideo === true;
  }

  function isVideoRecvEnabled(media) {
    Live.debug('isVideoRecvEnabled:', media);
    if (!media) return true; // Default
    if (media.video === false) return false; // Generic video has precedence
    if (media.videoRecv === undefined || media.videoRecv === null) return true; // Default
    return media.videoRecv === true;
  }

  function isScreenSendEnabled(media) {
    Live.debug('isScreenSendEnabled:', media);
    if (!media) return false;
    if (
      typeof media.video !== 'object' ||
      typeof media.video.mandatory !== 'object'
    )
      return false;
    var constraints = media.video.mandatory;
    if (constraints.chromeMediaSource)
      return (
        constraints.chromeMediaSource === 'desktop' ||
        constraints.chromeMediaSource === 'screen'
      );
    else if (constraints.mozMediaSource)
      return (
        constraints.mozMediaSource === 'window' ||
        constraints.mozMediaSource === 'screen'
      );
    else if (constraints.mediaSource)
      return (
        constraints.mediaSource === 'window' ||
        constraints.mediaSource === 'screen'
      );
    return false;
  }

  function isDataEnabled(media) {
    Live.debug('isDataEnabled:', media);
    if (Live.webRTCAdapter.browserDetails.browser === 'edge') {
      Live.warn("Edge doesn't support data channels yet");
      return false;
    }
    if (media === undefined || media === null) return false; // Default
    return media.data === true;
  }

  function isTrickleEnabled(trickle) {
    Live.debug('isTrickleEnabled:', trickle);
    return trickle === false ? false : true;
  }
  function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split('=');
      if (pair[0] == variable) {
        return pair[1];
      }
    }
    return false;
  }
}
export default Live;
