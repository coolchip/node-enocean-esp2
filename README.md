# node-enocean-esp2
Node to parse eltako br14 bus telegrams, based on EnOcean Serial Protocol 2

## How to use

Receive a message from an eltako bus for example with node-serialport. Then you can parse this message:

```javascript
const parser = require('enocean-esp2');

const buf = Buffer.alloc(0); // get your content from a bus
const translated = parser(buf);
console.dir(translated);
```

The module or the git repo includes also a TransformStream "TelegromTransfomer.js" including a code example. Additional this module is used by the node-red-contrib-enocean-esp2 (https://github.com/coolchip/node-red-contrib-enocean-esp2) which is also a good example for the usage.