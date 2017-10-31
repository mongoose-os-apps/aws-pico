load('api_mqtt.js');
load('api_gpio.js');
load('api_sys.js');
load('api_arduino_bme280.js');
load('api_config.js');
load('api_neopixel.js');
load('api_timer.js');
load('api_bh1730.js');

// Initialize BME280 sensor
let bme = Adafruit_BME280.create();
if (!bme.begin(Cfg.get('breakout.bme280_address'))) {
	die('BME280 not responding. Board problem?');
} else {
	print('BME280 sensor found!');
}

let bh1730 = BH1730.create(Cfg.get('breakout.bh1730_address'));
if (!bh1730) {
    die('BH1730 not responding. Board problem?');
}

let strip = NeoPixel.create(Cfg.get('breakout.ws2812_gpio'), 5, NeoPixel.GRB);
function set_strip(values) {
    for(let i = 0; i < values.length && i < 5; i++) {
        strip.setPixel(i, values[i][0], values[i][1], values[i][2]);
    }
    strip.show();
}
set_strip([ [55, 0, 0],
            [0, 55, 0],
            [0, 0, 55],
            [20, 20, 20],
            [0, 4, 3] ]);

/* Configure button pins */
let button_gpios = [
    Cfg.get('breakout.BTN1'),
    Cfg.get('breakout.BTN2'),
    Cfg.get('breakout.BTN3'),
    Cfg.get('breakout.BTN4'),
];

/* In this interrupt handler, post an MQTT message
   to <id>/buttons at the moment any button changes
   state
*/
function button_change_handler(gpio, button_num) {
    let topic = Cfg.get('device.id') + '/buttons';
    let msg = { button: button_num, value: !GPIO.read(gpio) };
    let ok = MQTT.pub(topic, JSON.stringify(msg));
    print('Published: ', ok ? 'yes' : 'no', ' topic: ', topic);
}
for (let i = 0; i < button_gpios.length; i++) {
    let gpio = button_gpios[i];
    GPIO.set_mode(gpio, GPIO.MODE_INPUT);
    GPIO.set_button_handler(gpio, GPIO.PULL_UP, GPIO.INT_EDGE_ANY, 100 /* debounce period */, button_change_handler, i + 1 /* userdata param */);
}

/* Periodically publish MQTT JSON messages to <id>/sensors with the full
   state of the breakout
*/
function poll_sensors()
{
    let button_values = [];
    for (let i = 0; i < button_gpios.length; i++) {
        button_values[i] = !GPIO.read(button_gpios[i]);
        if (button_values[i]) {
            print('BTN', i + 1, ' is pressed');
        }
    }

    let message = {
        temperature: bme.readTemperature(),
        humidity:    bme.readHumidity(),
        pressure:    bme.readPressure(),
        light_level: bh1730.read_lux(),
        buttons:     button_values,
        system:      {
            uptime: Sys.uptime(),
            free_ram: Sys.free_ram(),
        },
    };
	print('Temperature: ', message.temperature, '*C');
	print('Humidity:    ', message.humidity, '%RH');
	print('Pressure:    ', message.pressure, 'hPa');
    print('Light level: ', message.light_level, ' lux');

    let topic = Cfg.get('device.id') + '/sensors';
    let ok = MQTT.pub(topic, JSON.stringify(message), 1);
    print('Published: ', ok ? 'yes' : 'no', ' topic: ', topic);
}
Timer.set(1000, true, poll_sensors, null); /* Regular polling */

/* If someone publishes to the <id>/leds topic, send the
   data to the LED strip.

   Example JSON message:
   {
   "leds": [ [ 0, 0, 0],
             [0, 0, 0],
             [0, 0, 0],
             [0, 0, 0],
             [0, 0, 0]
           ],
   }

*/
let sub_topic = Cfg.get('device.id') + '/leds';
MQTT.sub(sub_topic, function(conn, topic, msg) {
    let msg = JSON.parse(msg);
    print('Topic:', topic, 'message:', msg);
    set_strip(msg.leds);
}, null);

