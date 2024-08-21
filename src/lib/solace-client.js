/**
 * Convenience wrapper around solclientjs, that provides only what this application needs:
 * - Direct messaging Pub/Sub
 * - Async connect/disconnect
 * - Session events watchers to react to any state changes asynchronously.
 * - Topic dispatcher: Demultiplexes messages received to its subscription's handler.
 *
 * The original version of this file comes from Solace's training GitHub repository: https://github.com/SolaceTraining
 * @source https://github.com/SolaceTraining/solace-battleship/blob/battleship-lesson-1-connect-and-publish-solution/battleship_frontend/src/common/solace-client.ts
 */
import solace from "solclientjs";

class SubscriptionObject {
  constructor(_callback, _isSubscribed) {
    this.callback = _callback;
    this.isSubscribed = _isSubscribed;
  }
}

class ResponseCode {
  static NO_ERROR = 0;
  static UNEXPECTED_EXCEPTION = 1;
  static SESSION_ALREADY_EXISTS = 2;
  static BAD_PROTOCOL = 3;
  static NO_SESSION = 4;

  constructor(rc, error_message) {
    this.rc = rc;
    this.error_message = error_message;
  }

  failed() {
    return this.rc !== ResponseCode.NO_ERROR;
  }

  success() {
    return this.rc === ResponseCode.NO_ERROR;
  }
}

/**
 * The SessionWatcherObject represents a watcher interested in session status change events:
 * - onConnect: Means the client connected to broker
 * - onConnectFail: Means the client attempted to connect to broker but failed
 * - onDisconnect: Means the client disconnected, or got disconnected from the broker.
 * - onSubscriptionSuccess: A subscription was registered successfully.
 * - onSubscriptionFailed: A subscription failed.
 */
class SessionWatcherObject {
  constructor(
      onConnected,
      onDisconnected,
      onConnectFailed,
      onSubscriptionSuccess,
      onUnsubscribeSuccess,
      onSubscriptionFailed) {
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.onConnectFailed = onConnectFailed;
    this.onSubscriptionSuccess = onSubscriptionSuccess;
    this.onUnsubscribeSuccess = onUnsubscribeSuccess;
    this.onSubscriptionFailed = onSubscriptionFailed;
  }
}

export class SolaceConnectionConfig {
  /**
   * Example values:
   * hostUrl: "wss:<Hostname>:443",
   * vpnName: "<VPN-DEMO>",
   * username: "<Username>",
   * password: "<Password>"
   * @param hostUrl URI to connect to Solace Broker
   * @param vpnName Message VPN to use
   * @param username Username
   * @param password password
   */
  constructor(hostUrl, vpnName, username, password) {
    this.hostUrl = hostUrl;
    this.vpnName = vpnName;
    this.username = username;
    this.password = password;
  }

}


export class SolaceClient {
  //Solace session object
  session = null;

  //Map that holds the topic subscription string and the associated callback function, subscription state
  topicSubscriptions = new Map();
  sessionWatchers = new Set();

  constructor() {
    //Initializing the solace client library
    let factoryProps = new solace.SolclientFactoryProperties();
    factoryProps.profile = solace.SolclientFactoryProfiles.version10;
    solace.SolclientFactory.init(factoryProps);
  }

  /**
   * Function that outputs to console with a timestamp
   * @param line String to log to the console
   */
  log(line) {
    let now = new Date();
    let time = [("0" + now.getHours()).slice(-2), ("0" + now.getMinutes()).slice(-2), ("0" + now.getSeconds()).slice(-2)];
    let timestamp = "[" + time.join(":") + "] ";
    console.log(timestamp + line);
  }

  /**
   * Function that connects to the Solace Broker.
   */
  connect(connectionConfig) {
      if (this.session !== null) {
        return new ResponseCode(
            ResponseCode.SESSION_ALREADY_EXISTS,
            "SolaceClient::connect() called, but a connection session already exists.");
      }
      // if there's no session, create one with the properties imported from the config file
      try {
        if (connectionConfig.hostUrl.indexOf("ws") !== 0) {
          return new ResponseCode(
              ResponseCode.BAD_PROTOCOL,
              "HostUrl must be the WebMessaging Endpoint that begins with either ws:// or wss://.");
        }

        this.session = solace.SolclientFactory.createSession({
          url: connectionConfig.hostUrl,
          vpnName: connectionConfig.vpnName,
          userName: connectionConfig.username,
          password: connectionConfig.password,
          connectRetries: 3,
          publisherProperties: {
            acknowledgeMode: solace.MessagePublisherAcknowledgeMode.PER_MESSAGE
          }
        });
      } catch (error) {
        this.log(error.toString());
        return new ResponseCode(
            ResponseCode.UNEXPECTED_EXCEPTION,
            "Unexpected exception while creating SMF Session: " + error.toString())
      }
      // define session event listeners

      //The UP_NOTICE dictates whether the session has been established
      this.session.on(solace.SessionEventCode.UP_NOTICE, sessionEvent => {
        this.log("=== Successfully connected and ready to subscribe. ===");

        this.sessionWatchers.forEach(watcher => {
          watcher.onConnected();
        });
      });

      //The CONNECT_FAILED_ERROR implies a connection failure
      this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, sessionEvent => {
        this.log("Connection failed to the message router: " + sessionEvent.infoStr + " - check correct parameter values and connectivity!");

        this.sessionWatchers.forEach(watcher => {
          watcher.onConnectFailed(sessionEvent);
        });
      });

      //DISCONNECTED implies the client was disconnected
      this.session.on(solace.SessionEventCode.DISCONNECTED, sessionEvent => {
        this.sessionWatchers.forEach(watcher => {
          watcher.onDisconnected(sessionEvent);
        });

        if (this.session !== null) {
          this.session.dispose();
          //this.subscribed = false;
          this.session = null;
        }
      });

      //ACKNOWLEDGED MESSAGE implies that the broker has confirmed message receipt
      this.session.on(solace.SessionEventCode.ACKNOWLEDGED_MESSAGE, sessionEvent => {
        this.log("Delivery of message with correlation key = " + sessionEvent.correlationKey + " confirmed.");
      });

      //REJECTED_MESSAGE implies that the broker has rejected the message
      this.session.on(solace.SessionEventCode.REJECTED_MESSAGE_ERROR, sessionEvent => {
        this.log("Delivery of message with correlation key = " + sessionEvent.correlationKey + " rejected, info: " + sessionEvent.infoStr);
      });

      //SUBSCRIPTION ERROR implies that there was an error in subscribing on a topic
      this.session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, sessionEvent => {
        this.sessionWatchers.forEach(watcher => {
          watcher.onSubscriptionFailed(sessionEvent);
        });
        //remote the topic from the TopicSubscriptionMap
        this.topicSubscriptions.delete(sessionEvent.correlationKey);
      });

      //SUBSCRIPTION_OK implies that a subscription was succesfully applied/removed from the broker
      this.session.on(solace.SessionEventCode.SUBSCRIPTION_OK, sessionEvent => {
        this.log(`Session co-relation-key for event: ${sessionEvent.correlationKey}`);
        //Check if the topic exists in the map
        if (this.topicSubscriptions.get(sessionEvent.correlationKey)) {
          this.sessionWatchers.forEach(watcher => {
            //If the subscription shows as subscribed, then this is a callback for unsubscription
            if (this.topicSubscriptions.get(sessionEvent.correlationKey).isSubscribed) {
              //Remove the topic from the map
              this.topicSubscriptions.delete(sessionEvent.correlationKey);
              watcher.onUnsubscribeSuccess(sessionEvent);
            } else {
              //Otherwise, this is a callback for subscribing
              this.topicSubscriptions.get(sessionEvent.correlationKey).isSubscribed = true;
              watcher.onSubscriptionSuccess(sessionEvent);
            }
          });
        }
      });

      //Message callback function
      this.session.on(solace.SessionEventCode.MESSAGE, message => {
        //Get the topic name from the message's destination
        let topicName = message.getDestination().getName();

        //Iterate over all subscriptions in the subscription map
        for (let sub of Array.from(this.topicSubscriptions.keys())) {
          //Replace all * in the topic filter with a .* to make it regex compatible
          let regexdSub = sub.replace(/\*/g, ".*");

          //if the last character is a '>', replace it with a .* to make it regex compatible
          if (sub.lastIndexOf(">") === sub.length - 1) regexdSub = regexdSub.substring(0, regexdSub.length - 1).concat(".*");

          let matched = topicName.match(regexdSub);

          //if the matched index starts at 0, then the topic is a match with the topic filter
          if (matched && matched.index === 0) {
            //Edge case if the pattern is a match but the last character is a *
            if (regexdSub.lastIndexOf("*") === sub.length - 1) {
              //Check if the number of topic sections are equal
              if (regexdSub.split("/").length !== topicName.split("/").length) return;
            }
            //Proceed with the message callback for the topic subscription if the subscription is active
            this.topicSubscriptions.get(sub).callback(message);
          }
        }
      });
      // connect the session
      try {
        this.session.connect();
      } catch (error) {
        return new ResponseCode(
            ResponseCode.UNEXPECTED_EXCEPTION,
            "Unexpected exception while requesting to connect the SMF Session: " + error.toString());
      }

      return new ResponseCode(
          ResponseCode.NO_ERROR,
          ""
      )
  }

  disconnect() {
    this.log("Disconnecting from Solace message router...");
    if (this.session !== null) {
      try {
        this.session.disconnect();
      } catch (error) {
        return new ResponseCode(
            ResponseCode.UNEXPECTED_EXCEPTION,
            "Unexpected exception while requesting to disconnect the SMF Session: " + error.toString());
      }
    } else {
      this.log("Not connected to Solace message router.");
    }

    return new ResponseCode(
        ResponseCode.NO_ERROR,
        ""
    )
  }

  unsubscribe(topicName) {
    if (!this.session) {
      return new ResponseCode(
          ResponseCode.NO_SESSION,
          "Cannot unsubscribe because a SMF session was not created.")
    }

    if (!this.topicSubscriptions.get(topicName)) {
      // Idempotency
      return new ResponseCode(
          ResponseCode.NO_ERROR,
          ""
      );
    }

    this.log(`Unsubscribing from ${topicName}...`);
    this.session.unsubscribe(solace.SolclientFactory.createTopicDestination(topicName), true, topicName);
    return new ResponseCode(
        ResponseCode.NO_ERROR,
        ""
    );
  }

  /**
   * Function that registers a session watcher
   *
   * @param onConnectCallback Client connected to broker.
   * @param onDisconnectedCallback client disconnected, or got disconnected from the broker.
   * @param onConnectFailedCallback Client attempted to connect to broker but failed.
   * @param onSubscriptionSuccess A subscription was registered successfully.
   * @param onUnsubscribeSuccess A unsubscribe operation failed.
   * @param onSubscriptionFailed A subscribe operation failed.
   *
   * @returns {SessionWatcherObject} Use this value to unregister later.
   */
  registerSessionWatcher(
      onConnectCallback,
      onDisconnectedCallback,
      onConnectFailedCallback,
      onSubscriptionSuccess,
      onUnsubscribeSuccess,
      onSubscriptionFailed) {
    let sessionWatcherObject = new SessionWatcherObject(
        onConnectCallback,
        onDisconnectedCallback,
        onConnectFailedCallback,
        onSubscriptionSuccess,
        onUnsubscribeSuccess,
        onSubscriptionFailed);
    this.sessionWatchers.add(sessionWatcherObject);
    return sessionWatcherObject;
  }

  /**
   * Function that unregisters a session watcher.
   *
   * @param sessionWatcher The watcher to un-register.  This gets returned by registerSessionWatcher.
   */
  unregisterSessionWatcher(sessionWatcher) {
    this.sessionWatchers.delete(sessionWatcher);
  }

  /**
   * Function that subscribes to the topic.
   * If this method returns with success, then the subscription request was sent and is pending.
   * Once the subscription request completes, either on
   *
   * @param topicName Topic string for the subscription
   * @param callback Callback for the function
   */
  subscribe(topicName, callback) {
    //Check if the session has been established
    if (!this.session) {
      return new ResponseCode(
          ResponseCode.NO_SESSION,
          "Cannot subscribe because a SMF session was not created.")
    }
    //Check if the subscription already exists
    if (this.topicSubscriptions.get(topicName)) {
      this.log(`Ignoring subscribe(): Already subscribed to ${topicName}.`);

      //Pretend success for idempotency.
      return new ResponseCode(
          ResponseCode.NO_ERROR,
          "");
    }
    this.log(`Subscribing to ${topicName}`);
    //Create a subscription object with the callback, upon successful subscription, the object will be updated
    let subscriptionObject = new SubscriptionObject(callback, false);
    this.topicSubscriptions.set(topicName, subscriptionObject);
    try {
      //Session subscription
      this.session.subscribe(
          solace.SolclientFactory.createTopicDestination(topicName),
          true, // generate confirmation when subscription is added successfully
          topicName, // use topic name as correlation key
          10000 // 10 seconds timeout for this operation
      );
    } catch (error) {
      return new ResponseCode(
          ResponseCode.UNEXPECTED_EXCEPTION,
          error.toString());
    }

    return new ResponseCode(
        ResponseCode.NO_ERROR,
        "");
  }

  /**
   * Publish a message on a topic
   * @param topic Topic to publish on
   * @param payload Payload on the topic
   */
  publish(topic, payload) {
    if (!this.session) {
      return new ResponseCode(
          ResponseCode.NO_SESSION,
          "Cannot publish because a SMF session was not created.")
    }
    let message = solace.SolclientFactory.createMessage();
    message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    message.setBinaryAttachment(payload);
    message.setCorrelationKey(topic);
    message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
    try {
      this.session.send(message);
    } catch (error) {
      return new ResponseCode(ResponseCode.UNEXPECTED_EXCEPTION, error.toString())
    }

    return new ResponseCode(ResponseCode.NO_ERROR, "")
  }
}