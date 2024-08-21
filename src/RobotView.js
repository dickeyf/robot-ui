import './App.css';
import React from "react";
import {Joystick} from "./joystick";

class RobotView extends React.Component {
    render() {
        return (
            <div className="h-screen">
                <div className="bg-gray-200 h-1/4 w-1/4">
                    <Joystick onJoystickMovement={this.props.onJoystickMovement}/>
                </div>
                <img src="http://172.24.0.89/camera"/>
            </div>
        );
    }

//
    constructor(props) {
        super(props);
    }
}

export default RobotView;
