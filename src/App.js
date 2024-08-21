import './App.css';
import React from "react";
import {SolaceClient, SolaceConnectionConfig} from "./lib/solace-client";
import RobotView from "./RobotView";

class App extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            connectionState: "DISCONNECTED",
            solaceClient: null,
            distance: 0,
            robotAngle: 0,
            websmfurl: localStorage.getItem("websmfurl"),
            msgvpn: localStorage.getItem("msgvpn"),
            clientusername: localStorage.getItem("clientusername"),
            clientpassword: localStorage.getItem("clientpassword"),
            connectionLastError: ""
        };

        this.onLoginSubmit = this.onLoginSubmit.bind(this);
        this.onWebsmfurlUpdated = this.onWebsmfurlUpdated.bind(this);
        this.onMsgvpnUpdated = this.onMsgvpnUpdated.bind(this);
        this.onClientusernameUpdated = this.onClientusernameUpdated.bind(this);
        this.onClientpasswordUpdated = this.onClientpasswordUpdated.bind(this);
        this.onJoystickMovement = this.onJoystickMovement.bind(this);
        this.sendUpdate = this.sendUpdate.bind(this);
    }

    render() {
        return (
            <div className="h-screen bg-slate-500">
                <div>
                    { this.state.connectionState == "DISCONNECTED" && (
                        <form className="w-full max-w-lg bg-slate-400 p-4" onSubmit={this.onLoginSubmit}>
                            <div className="flex flex-wrap -mx-3 mb-6">
                                <div className="w-full md:w-1/2 px-3 mb-6 md:mb-0">
                                    <label className="block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2">
                                        Broker web-smf URL
                                    </label>
                                    <input
                                        className="appearance-none block w-full bg-gray-200 text-gray-700 border border-red-500 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white"
                                        type="text"
                                        value={this.state.websmfurl}
                                        onChange={this.onWebsmfurlUpdated}
                                        name="websmfurl"/>
                                    <p className="text-red-500 text-xs italic">{!this.state.websmfurl && 'Please fill out this field.'}</p>
                                </div>
                                <div className="w-full md:w-1/2 px-3">
                                    <label className="block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2">
                                        Broker message VPN
                                    </label>
                                    <input
                                        className="appearance-none block w-full bg-gray-200 text-gray-700 border border-red-500 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white"
                                        type="text"
                                        value={this.state.msgvpn}
                                        onChange={this.onMsgvpnUpdated}
                                        name="msgvpn"/>
                                    <p className="text-red-500 text-xs italic">{!this.state.msgvpn && 'Please fill out this field.'}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap -mx-3 mb-6">
                                <div className="w-full md:w-1/2 px-3 mb-6 md:mb-0">
                                    <label className="block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2">
                                        Broker client username
                                    </label>
                                    <input
                                        className="appearance-none block w-full bg-gray-200 text-gray-700 border border-red-500 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white"
                                        type="text"
                                        value={this.state.clientusername}
                                        onChange={this.onClientusernameUpdated}
                                        name="clientusername"/>
                                    <p className="text-red-500 text-xs italic">{!this.state.clientusername && 'Please fill out this field.'}</p>
                                </div>
                                <div className="w-full md:w-1/2 px-3">
                                    <label className="block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2">
                                        Broker client password
                                    </label>
                                    <input
                                        className="appearance-none block w-full bg-gray-200 text-gray-700 border border-red-500 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white"
                                        type="text"
                                        value={this.state.clientpassword}
                                        onChange={this.onClientpasswordUpdated}
                                        name="clientpassword"/>
                                    <p className="text-red-500 text-xs italic">{!this.state.clientpassword && 'Please fill out this field.'}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap -mx-3 mb-6">
                                <div className="w-full md:w-1/2 px-3 mb-6 md:mb-0">
                                    {this.state.connectionState}
                                </div>
                                <div className="w-full md:w-1/2 px-3">
                                    <button
                                        type="submit"
                                        disabled={this.state.connectionState !== "DISCONNECTED"}
                                        className="g-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded">Connect
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
                <RobotView onJoystickMovement={this.onJoystickMovement} connectionState={this.state.connectionState} solaceClient={this.state.solaceClient}/>
            </div>
        )
            ;
    }

    componentDidMount() {
        setInterval(this.sendUpdate, 250);
    }

    onWebsmfurlUpdated(event) {
        let newState = this.state;

        newState.websmfurl = event.target.value;

        this.setState(newState);
    }

    onMsgvpnUpdated(event) {
        let newState = this.state;

        newState.msgvpn = event.target.value;

        this.setState(newState);
    }

    onClientusernameUpdated(event) {
        let newState = this.state;

        newState.clientusername = event.target.value;

        this.setState(newState);
    }

    onClientpasswordUpdated(event) {
        let newState = this.state;

        newState.clientpassword = event.target.value;

        this.setState(newState);
    }

    sendUpdate() {
        if (this.state.connectionState === "CONNECTED") {
            this.state.solaceClient.publish("iot/rovers/rover1/commands/thrust", JSON.stringify({
                commandName: "thrust",
                commandParam1: "",
                commandParam2: this.state.distance,
                commandParam3: this.state.robotAngle,
                commandParam4: false
            }))
        }
    }

    onJoystickMovement(joystickState) {
        if (this.state.connectionState === "CONNECTED") {
            let robotAngle = parseInt((joystickState.angle + Math.PI / 2) * 180 / Math.PI, 10);
            if (robotAngle > 180) {
                robotAngle -= 360;
            }
            let newState = this.state;
            newState.distance = joystickState.distance;
            newState.robotAngle = robotAngle;
            this.setState(newState);
        }
    }

    onLoginSubmit(event) {
        event.preventDefault();

        localStorage.setItem("websmfurl", this.state.websmfurl);
        localStorage.setItem("msgvpn", this.state.msgvpn);
        localStorage.setItem("clientusername", this.state.clientusername);
        localStorage.setItem("clientpassword", this.state.clientpassword);

        console.log("Connecting to solace broker.");
        let solaceClient = new SolaceClient();

        // Register this class as session watcher
        solaceClient.registerSessionWatcher(
            this.onConnected.bind(this),
            this.onDisconnected.bind(this),
            this.onConnectFail.bind(this),
            this.onSubscriptionSuccess.bind(this),
            this.onUnsubscribeSuccess.bind(this),
            this.onSubscriptionFailed.bind(this));

        solaceClient
            .connect(new SolaceConnectionConfig(
                this.state.websmfurl,
                this.state.msgvpn,
                this.state.clientusername,
                this.state.clientpassword
            ));
        let newState = this.state;
        newState.connectionState = "CONNECTING";
        newState.solaceClient = solaceClient;
        newState.connectionLastError = "";
        this.setState(newState);
    }

    onConnected() {
        let newState = this.state;
        newState.connectionState = "CONNECTED";
        this.setState(newState);
        console.log('Connected!');

        this.state.solaceClient.subscribe("iot/rovers/rover1/gps/events/reading", this.onGpsMessage.bind(this));
    }

    onGpsMessage(message) {
        console.log(message);
    }

    onDisconnected(event) {
        let newState = this.state;
        newState.connectionState = "DISCONNECTED";
        newState.solaceClient = null;
        newState.connectionLastError = event;
        this.setState(newState);

        console.log("Disconnected from broker.");
    }

    onConnectFail(event) {
        let newState = this.state;
        newState.connectionState = "DISCONNECTED";
        newState.solaceClient = null;
        newState.connectionLastError = event;
        this.setState(newState);

        console.log("Connection error.");
    }

    onSubscriptionSuccess(event) {
        console.log("Subscribed to topic: " + event.correlationKey);
    }

    onUnsubscribeSuccess(event) {
        console.log("Unsubscribed from topic: " + event.correlationKey);
    }

    onSubscriptionFailed(event) {
        console.log("Cannot subscribe to topic: " + event.correlationKey);
    }
}

export default App;