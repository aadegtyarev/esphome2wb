/*-------------------------*/
/* Description MQTT device */
/*-------------------------*/
mqttDevice = {      //     
    baseTopic: "esphome",
    statusTopic: "state",
    commandTopic: "command",
    allowWriteTopics: ["switch"],
    ignoredTopics: ["debug"],
    topicTypes: [
        { device: "switch", wb: "switch", conveter: "ON_OFF" },
        { device: "text_sensor", wb: "text" },
        { device: "sensor", wb: "text" },
        { device: "binary_sensor", wb: "switch", conveter: "ON_OFF" },
        { device: "debug", wb: "debug" },
        { device: "light", wb: "text" }
    ],
    getConverterType: function (topicType) {
        result = null;
        this.topicTypes.forEach(function (item) {
            if (item.device === topicType) result = item.conveter;
        });
        return result;
    },
    getTopicDevice: function (topic) {
        return topic.split('/')[1];
    },
    getTopicType: function (topic) {
        return topic.split('/')[2];
    },
    getTopicName: function (topic) {
        return topic.split('/')[3];
    },
    getTopicPath: function (topic) {
        return "{}/{}/{}/{}".format(
            this.baseTopic,
            this.getTopicDevice(topic),
            this.getTopicType(topic),
            this.getTopicName(topic)
        );
    },
    isAllowWriteTopic: function (topicType) {
        return (this.allowWriteTopics.indexOf(topicType) > -1);
    },
    isIgnoredTopic: function (topicType) {
        return (this.ignoredTopics.indexOf(topicType) > -1);
    }
};

/*-------------------------*/
/* Converter Device        */
/*-------------------------*/
conveterDevice = {
    deviceName: "esphome2wb",
    topicBaseTopic: "Base topic",
    init: function () {
        if (Boolean(this.deviceName) & !isExistsDevice(this.deviceName)) {
            createVirtualDevice(this.deviceName);
            virtualDevice = getDevice(this.deviceName);
            createControlIsNotExists(virtualDevice, this.topicBaseTopic, "text", mqttDevice.baseTopic, true);
        }
    },
};

conveterDevice.init();

/*--------------------------*/
/* Virtual device generator */
/*--------------------------*/

trackMqtt(mqttDevice.baseTopic + "/#", function (message) {
    newValue = message.value;
    topic = message.topic;
    deviceName = mqttDevice.getTopicDevice(topic);
    topicType = mqttDevice.getTopicType(topic);
    topicName = mqttDevice.getTopicName(topic);
    topicPath = mqttDevice.getTopicPath(topic);
    statusTopic = mqttDevice.statusTopic;
    commandTopic = mqttDevice.commandTopic

    controlName = topicName;
    controlType = getControlType(topicType, newValue);
    controlDefaultValue = getDefaultValue(controlType);
    controlReadOnly = !mqttDevice.isAllowWriteTopic(topicType);
    converterType = mqttDevice.getConverterType(topicType);

    if (!mqttDevice.isIgnoredTopic(topicType)) {
        //log.debug("[{}]\n | {} → Changed topic: {} → {}".format("trackMqtt", "mqtt", topic, newValue));
        //TODO: Сделать конвертер в/из 
            //{
                //"color_mode": "brightness",
                //"brightness": 8,
                //"color": {}
            //}
            // /devices/lab-light/controls/lab_light
        //preparation newValue
        switch (controlType) {
            case "switch":
                newValue = convertValue(converterType, newValue);
                break;
            case "value":
                newValue = formatValue(newValue);
                break;
        }

        if (!isExistsDevice(deviceName)){
            createVirtualDevice(deviceName);
        }
        
        
        virtualDevice = getDevice(deviceName);
        controlPath = genControlPath(virtualDevice.getId(), controlName);

        if (createControlIsNotExists(
            virtualDevice,
            controlName,
            controlType,
            controlDefaultValue,
            controlReadOnly)) {
           
            if (!controlReadOnly) {
                addAction(controlPath, topicPath, statusTopic, commandTopic, controlType, converterType);
            }
        }
      
        if (dev[controlPath] !== newValue) {
            dev[controlPath] = newValue;
        }
    }
});

function createVirtualDevice(deviceName) {
    defineVirtualDevice(deviceName, {
        title: deviceName,
        cells: {}
    })
}

function createControlIsNotExists(virtualDevice, controlName, controlType, controlDefaultValue, controlReadOnly) {

    if (!virtualDevice.isControlExists(controlName)) {
        virtualDevice.addControl(controlName,
            {
                type: controlType,
                value: controlDefaultValue,
                readonly: controlReadOnly,
                order: 0
            }
        );
        return true;
    } else {
        return false;
    }
}

function addAction( controlPath, topicPath, statusTopic, commandTopic, controlType, converterType) {
    defineRule({
        whenChanged: "{}".format(controlPath),
        then: function (newValue, devName, cellName) {
            //log.debug("[{}]\n | {} → Changed control: {} = {} ".format("whenChanged", "wb", controlPath, newValue));
            switch (controlType) {
                case "switch":
                    toggleSwitch(commandTopic, topicPath, newValue, converterType);
                    break;
                default:
                    publishValue(statusTopic, topicPath, newValue);
                    break;
            }
        }
    });
}

function getControlType(topicType, value) {
    mqttDevice.topicTypes.forEach(function (item) {
        if (item.device === topicType) controlType = item.wb;
    });

    if (controlType === "text") {
        return isNumber(value) ? "value" : "text";
    } else {
        return controlType;
    }
}

function getDefaultValue(controlType) {
    switch (controlType) {
        case "switch":
            return false;

        case "text":
            return "";

        case "value":
            return 0;
        
        default:
            return false;
    }
}

function getControlMeta(deviceName, controlName, controlMetaName) {
    return dev["{}#{}".format(genControlPath(deviceName, controlName), controlMetaName)];
}

function genControlPath(deviceName, controlName) {
    return "{}/{}".format(deviceName, controlName);
}

function genTextId(text) {
    return text.toLowerCase().trim().replace(" ", "-").replace("_", "-");
}

function genActionName(controlName) {
    return "rule_{}".format("rule", controlName);
}

function isExistsDevice(deviceName) {
    return (getDevice(deviceName) !== undefined);
}

function formatValue(value) {
    return isNumber(value) ? Number(value) : String(value);
}

function isNumber(value) {
    return Number(value) === +value && value !== null;
}

function isJson(text){
    return (text.indexOf("{")>-1 && text.indexOf("}")>-1);
  }

// Universal converter
function convertValue(converterType, value) {
    switch (converterType) {
        case "ON_OFF":
            if (typeof value === "string" || value instanceof String) {
                return value == "OFF" ? false : true;
            }
            else {
                return value ? "ON" : "OFF";
            }
        case "1_0":
            if (typeof value === "string" || value instanceof String) {
                return value == "0" ? false : true;
            }
            else {
                return value ? "1" : "0";
            }
        default:
            return value;
    }
}

function toggleSwitch(postfixTopic, topicName, newValue, converterType) {
    publishValue(postfixTopic, topicName, convertValue(converterType, newValue))
}

function publishValue(postfixTopic, topicName, newValue) {
    cmdTopicName = postfixTopic ? "{}/{}".format(topicName, postfixTopic) : topicName;
    publish(cmdTopicName, newValue, 2, false);
}