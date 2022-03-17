# esphome2wb
## Описание
Конвертер mqtt-топиков ESPHome в нотацию Wiren Board

Поддерживает контролы:
- switch
- binary_sensor
- text_sensor
- sensor

![изображение](https://user-images.githubusercontent.com/77433258/158841718-c329482c-fa12-4e77-9514-fcc85478659a.png)

## Настройка MQTT в прошивке ESPHome

Добавьте в файл конфигурации прошивки строки:
```yaml
  name: "my_device"
  prefix: "esphome/${name}"

# Настройки подключения к MQTT-брокеру
mqtt:
  broker: 192.168.1.0 # укажите IP-адрес контроллера
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

## Настройка в контроллере Wiren Board
Положите файл **esphome2wb.js** в папку `/etc/wb-rules/` или создайте в веб-интерфейсе контроллера новый скрипт и вставьте в него содержимое этого файла.

Всё, теперь все устройства с прошивкой ESPHome, которые подключаются к MQTT-брокеру контроллера автоматически появятся на вкладке **Devices**.
