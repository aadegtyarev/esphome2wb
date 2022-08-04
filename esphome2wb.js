/*-------------------------*/
/* Description MQTT device */
/*-------------------------*/

mqttDevice = {      //     
    baseTopic: "esphome",
    allowWriteTopics: ["switch", "state", "brightness"],
    ignoredTopics: ["debug"],
    entityTypes: [
        { esp: "switch", wb: "switch", converter: "ON_OFF" },
        { esp: "state", wb: "switch", converter: "ON_OFF" },
        { esp: "brightness", wb: "text" },
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
    getEntityType: function (topic) {
        return topic.split('/')[2];
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
    var parsedData = parseTopicData(espTopic)

    if (!mqttDevice.isIgnoredTopic(parsedData["entity_type"])) {
        createVirtualDevice(parsedData["device"])

        if (!isJSON(msg.value)) {
            var control = genControlObj(parsedData, msg.value)
            createControl(control)

            var newValue = convertValue(parsedData["converter_type"], msg.value)
            writeWbControlValue(parsedData["device"], parsedData["control_name"], newValue)
        } else {
            var controls = JSON.parse(msg.value);
            for (var key in controls) {
                var jsonTopic = parsedData["control_name"]
                var control = genControlObj({
                    topic: espTopic.substring(0, espTopic.length - 6),
                    entity_type: key,
                    control_type: getControlType(key),
                    device: parsedData["device"],
                    control_name: "{}_{}".format(jsonTopic, key),
                    converter_type: mqttDevice.getConverterType(key),
                    json_topic: jsonTopic
                },
                    controls[key])
                createControl(control)

                var newValue = convertValue(control["converter_type"], controls[key])
                writeWbControlValue(control["device"], control["name"], newValue)
            }
        }
    }
});

function parseTopicData(espTopic) {
    var entityType = mqttDevice.getEntityType(espTopic)
    return {
        topic: espTopic.substring(0, espTopic.length - 6),
        entity_type: entityType,
        control_type: getControlType(entityType),
        device: espTopic.split('/')[1],
        control_name: espTopic.split('/')[3],
        converter_type: mqttDevice.getConverterType(entityType)
    }
}

function genControlObj(parsedData, value) {
    return {
        "device": parsedData["device"],
        "name": parsedData["control_name"],
        "title": parsedData["control_name"],
        "type": parsedData["control_type"],
        "readonly": !mqttDevice.isAllowWriteTopic(parsedData["entity_type"]) && !isJSON(value),
        "default": getDefaultValue(parsedData["control_type"]),
        "order": 0,
        "command_topic": "{}/command".format(parsedData["topic"]),
        "state_topic": "{}/state".format(parsedData["topic"]),
        "converter_type": parsedData["converter_type"],
        "json_topic" : parsedData["json_topic"]
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

        log(control["json_topic"])
        if (control["json_topic"] != undefined){
            var paramName = control["name"].replace(control["json_topic"]+"_","")
            log(paramName)
            newValue = '{ "{}":"{}" }'.format(paramName, newValue)
        }

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
            "json_topic": control["json_topic"]
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

function isJSON(value) {
    return value[0] != undefined && value[0] == "{"
}

function convertValue(converterType, value) {
    switch (converterType) {
        case "ON_OFF":
            if (isNumber(value)) {
                return value == 1 ? "ON" : "OFF";
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
