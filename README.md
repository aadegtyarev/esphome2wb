# esphome2wb
Конвертер mqtt-топиков esphome в нотацию Wiren Board

Поддерживает сенсоры:
- switch
- binary_sensor
- text_sensor
- sensor

Настройка MQTT в esphome.
```yaml
  name: "my_device"
  prefix: "esphome/${name}"

# Настройки подключения к MQTT-брокеру
mqtt:
  broker: 192.168.1.0
  port: 1883
  username: ''
  password: ''
  discovery: false
  id: mqtt_client
  topic_prefix: "${prefix}"  

# Передача статуса в MQTT
  birth_message:
      topic: "${prefix}/text_sensor/status/state"
      payload: online

  will_message:
      topic: "${prefix}/text_sensor/status/state"
      payload: offline

  shutdown_message :
      topic: "${prefix}/text_sensor/status/state"
      payload: shutdown

```