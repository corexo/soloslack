const { EventEmitter } = require('events');

// In-process pub/sub for live agent activity (SSE subscribers)
const bus = new EventEmitter();
bus.setMaxListeners(100);

module.exports = bus;
