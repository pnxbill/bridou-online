import os from 'os'
const interfaces = os.networkInterfaces();

const addresses = [];

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name] as any) {
    // skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if (iface.family !== 'IPv4' || iface.internal !== false) {
      continue;
    }
    addresses.push(iface.address);
  }
}

export default addresses[0]