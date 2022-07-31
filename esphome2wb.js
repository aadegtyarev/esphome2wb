/*-------------------------*/
/* Description MQTT device */
/*-------------------------*/

mqttDevice = {      //     
    baseTopic: "esphome",
    allowWriteTopics: ["switch", "light"],
    ignoredTopics: ["debug"],
    entityTypes: [
        { esp: "switch", wb: "switch", converter: "ON_OFF" },
        { esp: "text_sensor", wb: "text" },
        { esp: "sensor", wb: "text" },
        { esp: "binary_sensor", wb: "switch", converter: "ON_OFF" },
        { esp: "debug", wb: "debug" }
    ],
    getConverterType: function (entityType) {
        result = null;
        this.entityTypes.forEach(function (item) {
            if (item.esp === entityType) result = item.converter;
        });
        return result;
    },
    getDeviceName: function (topic) {
        return topic.split('/')[1];
    },
    getEntityType: function (topic) {
        return topic.split('/')[2];
    },
    getTopicName: function (topic) {
        return topic.split('/')[3];
    },
    getTopicPath: function (topic) {
        return "{}/{}/{}/{}".format(
            this.baseTopic,
            this.getTopicDevice(topic),
            this.getEntityType(topic),
            this.getTopicName(topic)
        );
    },
    isAllowWriteTopic: function (entityType) {
        return (this.allowWriteTopics.indexOf(entityType) > -1);
    },
    isIgnoredTopic: function (entityType) {
        return (this.ignoredTopics.indexOf(entityType) > -1);
    }
};


/** ------- */
/** Session */
/** ------- */

session = {
    devices: [],
    controls: [],
    options: [],
    deviceIsExists: function (deviceName) {
        return (this.devices.indexOf(deviceName) > -1)
    },
    controlIsExists: function (topic) {
        return getElement(this.controls, "id", topic, "id") != undefined
    },
    getControlMeta: function (topic) {
        return getElement(this.controls, "id", topic, "meta")
    },
    getControl: function (topic, byId) {
        result = null
        session.controls.forEach(function (item) {
            if (item[byId] == topic) result = item
        });

        return result
    },
    getDevicesCount: function () {
        return length(this.devices)
    }
};

/**-------------------------*/
/** Converter Device        */
/**-------------------------*/

converterDevice = {
    name: "esphome2wb",
    baseTopic: "Base Topic",
    count: "Devices Count",
    init: function () {
        try {
            if (Boolean(this.name)) {
                createVirtualDevice(this.name);

                createControl(
                    {
                        device: this.name,
                        name: this.baseTopic,
                        type: "text",
                        readonly: true
                    }
                );
                writeWbControlValue(this.name, this.baseTopic, mqttDevice.baseTopic)

                createControl(
                    {
                        device: this.name,
                        name: this.count,
                        type: "value",
                        readonly: true
                    }
                );
                writeWbControlValue(this.name, this.count, 0)
            }
            log("{} converter started", this.name)
        } catch (error) {
            log("{} converter error: {}", error)
        }
    },
};

converterDevice.init();

/** --------- */
/** Converter */
/** --------- */

trackMqtt(mqttDevice.baseTopic + "/+/+/+/state", function (msg) {
    var espTopic = msg.topic
    var entityType = mqttDevice.getEntityType(espTopic)

    if (!mqttDevice.isIgnoredTopic(entityType)) {
        espTopic = espTopic.substring(0, espTopic.length - 6)
        var control = genControlObj(espTopic)

        createVirtualDevice(control["device"])
        createControl(control)

        //var control = session.getControl(msg.topic, "state_topic")
        var newValue = convertValue(control["converter_type"], msg.value)

        writeWbControlValue(control["device"], control["name"], newValue)
    }
});

function genControlObj(espTopic) {
    var entityType = mqttDevice.getEntityType(espTopic)
    var controlType = getControlType(entityType)
    var deviceName = mqttDevice.getDeviceName(espTopic)
    var topicName = mqttDevice.getTopicName(espTopic)

    return {
        "device": deviceName,
        "name": topicName,
        "title": topicName,
        "type": controlType,
        "readonly": !mqttDevice.isAllowWriteTopic(entityType),
        "default": getDefaultValue(controlType),
        "order": 0,
        "command_topic": "{}/command".format(espTopic),
        "state_topic": "{}/state".format(espTopic),
        "converter_type": mqttDevice.getConverterType(entityType)
    }
}

function getControlType(entityType) {
    result = getElement(
        mqttDevice.entityTypes,
        "esp",
        entityType,
        "wb"
    )
    return (result != undefined) ? result : "text"
}

function addAction(control) {
    var wbControl = "/devices/{}/controls/{}/on".format(
        control["device"],
        control["name"]
    )

    trackMqtt(wbControl, function (msg) {
        var control = session.getControl(
            msg.topic.substring(0, msg.topic.length - 3),
            "id"
        )
        var newValue = convertValue(control["converter_type"], msg.value)

        publishValue(control["command_topic"], newValue)
    });
}

/** -------------- */
/** Virtual Device */
/** -------------- */

function createVirtualDevice(deviceName) {

    if (!session.deviceIsExists(deviceName)) {
        publishValue("/devices/{}/meta/name".format(deviceName), deviceName)
        publishValue("/devices/{}/meta/driver".format(deviceName), "ha2wb")

        updateDevicesCount(
            session.devices.push(deviceName) - 1
        )
    }
}

function updateDevicesCount(value) {
    writeWbControlValue(converterDevice.name, converterDevice.count, value)
}

function createControl(control) {
    var topic = genWbTopicName(control["device"], control["name"])

    if (!session.controlIsExists(topic)) {
        var meta = genControlMeta(control)

        publishValue("{}/meta".format(topic), JSON.stringify(meta))
        session.controls.push({
            "id": topic,
            "meta": meta,
            "name": control["name"],
            "readonly": control["readonly"],
            "converter_type": control["converter_type"],
            "state_topic": control["state_topic"],
            "command_topic": control["command_topic"],
            "device": control["device"],
            "json": control["json"]
        })

        // костыли, обходящий багу с тем, что range не работает, если не выставлен max по старому формату

        if (meta["max"] != undefined) {
            publishValue("{}/meta/max".format(topic), meta["max"])
        }

        if (meta["order"] != undefined) {
            publishValue("{}/meta/order".format(topic), meta["order"])
        }

        if (!control["readonly"]) addAction(control)
    }
}

function genControlMeta(control) {
    return {
        "type": control["type"],
        "title": {
            "en": control["title"]
        },
        "units": control["units"],
        "readonly": control["readonly"],
        "default": control["default"],
        "order": control["order"],
        "min": control["min"],
        "max": control["max"]
    }
}

function genWbTopicName(deviceName, controlName) {
    return "/devices/{}/controls/{}".format(deviceName, controlName);
}

function getDefaultValue(controlType) {
    switch (controlType) {
        case "text":
            return ""

        case "value":
            return 0;

        case "range":
            return 0

        case "switch":
            return false

        default:
            return 0
    }
}

function writeWbControlValue(deviceName, controlName, newValue) {
    publishValue("/devices/{}/controls/{}".format(deviceName, controlName), formatValue(newValue))
}

function publishValue(topic, newValue) {
    publish(topic, newValue, 2, true)
}


/** ----------------- */
/** Service functions */
/** ----------------- */

function formatValue(value) {
    return isNumber(value) ? Number(value) : String(value)
}

function isNumber(value) {
    return Number(value) === +value && value !== null
}

function isString(value) {
    return ((typeof value === "string" || value instanceof String) && (value !== "true" && value !== "false"))
}

function convertValue(converterType, value) {
    switch (converterType) {
        case "ON_OFF":
            if (isNumber(value)) {
                return 1 ? "ON" : "OFF";
            }
            else {
                return value == "OFF" ? false : true;
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

function getElement(arr, searchByKey, searchStr, resultKey) {
    for (k in arr) {
        if (arr[k][searchByKey] === searchStr) {
            return arr[k][resultKey]
        }
    }
}
